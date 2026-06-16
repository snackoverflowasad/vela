"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffSnapshots = diffSnapshots;
exports.diffSession = diffSession;
exports.renderDiff = renderDiff;
const Diff = __importStar(require("diff"));
/** Build a FileDiff comparing two snapshots (either can be null for new/deleted files) */
function diffSnapshots(before, after, filePath) {
    const beforeContent = before?.lines.join('\n') ?? '';
    const afterContent = after?.lines.join('\n') ?? '';
    if (!before && after) {
        // New file
        const lines = after.lines.map((content, i) => ({
            lineNumber: i + 1,
            type: 'added',
            content,
        }));
        return {
            file: filePath,
            changeType: 'added',
            linesAdded: after.lines.length,
            linesRemoved: 0,
            hunks: [{ oldStart: 0, newStart: 1, lines }],
        };
    }
    if (before && !after) {
        // Deleted file
        const lines = before.lines.map((content, i) => ({
            lineNumber: i + 1,
            type: 'removed',
            content,
        }));
        return {
            file: filePath,
            changeType: 'removed',
            linesAdded: 0,
            linesRemoved: before.lines.length,
            hunks: [{ oldStart: 1, newStart: 0, lines }],
        };
    }
    if (before?.hash === after?.hash) {
        return { file: filePath, changeType: 'unchanged', linesAdded: 0, linesRemoved: 0, hunks: [] };
    }
    // Modified file — use structural diff
    const rawDiff = Diff.structuredPatch(filePath, filePath, beforeContent, afterContent, '', '', { context: 3 });
    let totalAdded = 0;
    let totalRemoved = 0;
    const hunks = rawDiff.hunks.map((hunk) => {
        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        const lines = [];
        for (const line of hunk.lines) {
            if (line.startsWith('+')) {
                lines.push({ lineNumber: newLine, type: 'added', content: line.slice(1) });
                newLine++;
                totalAdded++;
            }
            else if (line.startsWith('-')) {
                lines.push({ lineNumber: oldLine, type: 'removed', content: line.slice(1) });
                oldLine++;
                totalRemoved++;
            }
            else {
                lines.push({ lineNumber: newLine, type: 'context', content: line.slice(1) });
                oldLine++;
                newLine++;
            }
        }
        return { oldStart: hunk.oldStart, newStart: hunk.newStart, lines };
    });
    return {
        file: filePath,
        changeType: 'modified',
        linesAdded: totalAdded,
        linesRemoved: totalRemoved,
        hunks,
    };
}
/** Compute the full diff for an entire session */
function diffSession(session) {
    const allFiles = new Set([
        ...Object.keys(session.before),
        ...Object.keys(session.after),
    ]);
    const files = [];
    let totalAdded = 0;
    let totalRemoved = 0;
    for (const file of allFiles) {
        const fd = diffSnapshots(session.before[file] ?? null, session.after[file] ?? null, file);
        if (fd.changeType !== 'unchanged') {
            files.push(fd);
            totalAdded += fd.linesAdded;
            totalRemoved += fd.linesRemoved;
        }
    }
    return {
        sessionId: session.id,
        label: session.label,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        files,
        totalAdded,
        totalRemoved,
        totalFilesChanged: files.filter(f => f.changeType !== 'unchanged').length,
    };
}
/** Render a SessionDiff as a human-readable unified-diff string */
function renderDiff(sd, { color = true } = {}) {
    const c = color
        ? { add: '\x1b[32m', rem: '\x1b[31m', hdr: '\x1b[36m', dim: '\x1b[2m', rst: '\x1b[0m' }
        : { add: '', rem: '', hdr: '', dim: '', rst: '' };
    const lines = [];
    lines.push(`${c.hdr}Session: ${sd.label} [${sd.sessionId}]${c.rst}`);
    lines.push(`${c.dim}${sd.startedAt} → ${sd.endedAt ?? 'in progress'}${c.rst}`);
    lines.push(`${c.add}+${sd.totalAdded}${c.rst}  ${c.rem}-${sd.totalRemoved}${c.rst}  across ${sd.totalFilesChanged} file(s)\n`);
    for (const fd of sd.files) {
        const tag = fd.changeType === 'added' ? `${c.add}[NEW]${c.rst}` :
            fd.changeType === 'removed' ? `${c.rem}[DEL]${c.rst}` :
                `${c.hdr}[MOD]${c.rst}`;
        lines.push(`${tag} ${fd.file}  ${c.add}+${fd.linesAdded}${c.rst} ${c.rem}-${fd.linesRemoved}${c.rst}`);
        for (const hunk of fd.hunks) {
            lines.push(`${c.dim}@@ -${hunk.oldStart} +${hunk.newStart} @@${c.rst}`);
            for (const line of hunk.lines) {
                if (line.type === 'added')
                    lines.push(`${c.add}+ ${String(line.lineNumber).padStart(4)}  ${line.content}${c.rst}`);
                else if (line.type === 'removed')
                    lines.push(`${c.rem}- ${String(line.lineNumber).padStart(4)}  ${line.content}${c.rst}`);
                else
                    lines.push(`${c.dim}  ${String(line.lineNumber).padStart(4)}  ${line.content}${c.rst}`);
            }
        }
        lines.push('');
    }
    return lines.join('\n');
}
