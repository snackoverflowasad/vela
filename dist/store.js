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
exports.storeDir = storeDir;
exports.storePath = storePath;
exports.initStore = initStore;
exports.loadStore = loadStore;
exports.saveStore = saveStore;
exports.makeId = makeId;
exports.generateCodename = generateCodename;
exports.captureFile = captureFile;
exports.createCheckpoint = createCheckpoint;
exports.resolveCheckpoint = resolveCheckpoint;
exports.restoreCheckpoint = restoreCheckpoint;
exports.getHistory = getHistory;
exports.purgeAfterCommit = purgeAfterCommit;
exports.getLatestGitCommit = getLatestGitCommit;
exports.installGitHook = installGitHook;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const STORE_FILE = 'store.json';
const STORE_DIR_NAME = '.vela';
// ── Paths ──────────────────────────────────────────────────────────────────
function storeDir(rootDir) {
    return path.join(path.resolve(rootDir), STORE_DIR_NAME);
}
function storePath(rootDir) {
    return path.join(storeDir(rootDir), STORE_FILE);
}
// ── Init / Load / Save ────────────────────────────────────────────────────
function initStore(rootDir, targets) {
    const dir = storeDir(rootDir);
    const file = storePath(rootDir);
    fs.mkdirSync(dir, { recursive: true });
    // Write .gitignore so users don't accidentally commit snapshots
    const gi = path.join(dir, '.gitignore');
    if (!fs.existsSync(gi))
        fs.writeFileSync(gi, '*\n!.gitignore\n');
    if (fs.existsSync(file)) {
        const store = loadStore(rootDir);
        if (targets && targets.length > 0) {
            store.targets = targets;
            saveStore(rootDir, store);
        }
        return store;
    }
    const store = {
        version: 1,
        rootDir: path.resolve(rootDir),
        checkpoints: [],
        head: null,
        index: {},
        committed: [],
        targets,
    };
    saveStore(rootDir, store);
    return store;
}
function loadStore(rootDir) {
    const file = storePath(rootDir);
    if (!fs.existsSync(file))
        return initStore(rootDir);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function saveStore(rootDir, store) {
    fs.mkdirSync(storeDir(rootDir), { recursive: true });
    fs.writeFileSync(storePath(rootDir), JSON.stringify(store, null, 2), 'utf8');
}
// ── ID / Codename helpers ─────────────────────────────────────────────────
function makeId() {
    return 'chk_' + crypto.randomBytes(3).toString('hex');
}
/**
 * Codenames are designed to be:
 * 1. Unique enough to avoid collision
 * 2. Semantically hintful — derived from the intent
 * 3. Stable — AI can refer to them consistently
 *
 * Format: <adjective>-<intent-slug>-<short-hash>
 * e.g.  "glacier-add-dark-mode-7f3a"
 */
const ADJECTIVES = [
    'amber', 'arctic', 'azure', 'blaze', 'bronze', 'cedar', 'cobalt', 'coral',
    'crimson', 'dawn', 'dusk', 'ember', 'flint', 'forge', 'frost', 'glacier',
    'granite', 'harbor', 'indigo', 'jade', 'lunar', 'maple', 'maroon', 'mist',
    'nova', 'obsidian', 'onyx', 'opal', 'prism', 'quartz', 'ruby', 'sage',
    'scarlet', 'slate', 'solar', 'steel', 'storm', 'teal', 'terra', 'timber',
    'topaz', 'twilight', 'ultra', 'umber', 'velvet', 'violet', 'walnut', 'zenith',
];
function generateCodename(intent, id) {
    const hash = id.replace('chk_', '');
    const adjIdx = parseInt(hash.slice(0, 2), 16) % ADJECTIVES.length;
    const adj = ADJECTIVES[adjIdx];
    const slug = intent
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 4)
        .join('-');
    return `${adj}-${slug}-${hash}`;
}
// ── File capture ──────────────────────────────────────────────────────────
function captureFile(filePath, rootDir) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
        const relPath = path.relative(path.resolve(rootDir), filePath);
        return {
            path: relPath,
            content,
            hash,
            lines: content.split('\n').length,
        };
    }
    catch {
        return null;
    }
}
// ── Checkpoint operations ─────────────────────────────────────────────────
function createCheckpoint(rootDir, store, opts) {
    const id = makeId();
    const codename = generateCodename(opts.intent, id);
    const files = {};
    for (const fp of opts.filePaths) {
        const state = captureFile(fp, rootDir);
        if (state)
            files[state.path] = state;
    }
    const parentCheckpoint = store.head ? store.checkpoints.find(c => c.id === store.head) : null;
    const diffs = {};
    const { diffSnapshots } = require('./diff');
    for (const [relPath, newState] of Object.entries(files)) {
        const parentFile = parentCheckpoint?.files[relPath];
        const beforeSnap = parentFile && parentFile.content ? {
            file: path.join(rootDir, relPath),
            capturedAt: parentCheckpoint.createdAt,
            hash: parentFile.hash,
            lines: parentFile.content.split('\n'),
        } : null;
        const afterSnap = {
            file: path.join(rootDir, relPath),
            capturedAt: new Date().toISOString(),
            hash: newState.hash,
            lines: newState.content.split('\n'),
        };
        const fd = diffSnapshots(beforeSnap, afterSnap, path.join(rootDir, relPath));
        if (fd.changeType !== 'unchanged') {
            diffs[relPath] = fd;
        }
    }
    // Save changes under .vela/changes/<codename>.json (AI-readable format)
    const changesDir = path.join(storeDir(rootDir), 'changes');
    fs.mkdirSync(changesDir, { recursive: true });
    fs.writeFileSync(path.join(changesDir, `${codename}.json`), JSON.stringify({
        id,
        codename,
        intent: opts.intent,
        description: opts.description,
        createdAt: new Date().toISOString(),
        changes: diffs,
    }, null, 2), 'utf8');
    // Strip content of older checkpoints to keep store.json extremely small
    for (const cp of store.checkpoints) {
        for (const fileState of Object.values(cp.files)) {
            fileState.content = '';
        }
    }
    const checkpoint = {
        id,
        codename,
        description: opts.description,
        intent: opts.intent,
        createdAt: new Date().toISOString(),
        rootDir: path.resolve(rootDir),
        files,
        tags: opts.tags ?? [],
        parent: store.head ?? undefined,
    };
    store.checkpoints.push(checkpoint);
    store.index[codename] = id;
    store.index[id] = id; // also index by id directly
    store.head = id;
    saveStore(rootDir, store);
    return checkpoint;
}
/** Resolve a codename OR id OR partial match → Checkpoint */
function resolveCheckpoint(store, ref) {
    // Exact id or codename
    const id = store.index[ref];
    if (id)
        return store.checkpoints.find(c => c.id === id) ?? null;
    // Partial match on codename
    const partial = store.checkpoints.find(c => c.codename.includes(ref));
    if (partial)
        return partial;
    return null;
}
/** Restore all files from a checkpoint to disk */
function restoreCheckpoint(checkpoint, rootDir) {
    const restored = [];
    for (const [relPath, state] of Object.entries(checkpoint.files)) {
        const fullPath = path.join(path.resolve(rootDir), relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, state.content, 'utf8');
        restored.push(fullPath);
    }
    return restored;
}
/** Get the chain of checkpoints from HEAD back to the first */
function getHistory(store) {
    const result = [];
    let current = store.checkpoints.find(c => c.id === store.head);
    const visited = new Set();
    while (current && !visited.has(current.id)) {
        result.push(current);
        visited.add(current.id);
        current = store.checkpoints.find(c => c.id === current.parent);
    }
    return result;
}
/**
 * Purge all current checkpoints after a git commit.
 *
 * Keeps a lightweight CommitRecord in store.committed[] so you still have
 * an audit trail of *which* codename was committed, but the full file
 * content snapshots are gone.
 *
 * Logic:
 *  - Walk the parent chain from HEAD — those are the "cycle" checkpoints
 *  - Delete them all from store.checkpoints + store.index
 *  - Reset store.head to null (clean slate)
 *  - Push a CommitRecord to store.committed[]
 */
function purgeAfterCommit(rootDir, store, commitHash, commitMessage) {
    const cycle = getHistory(store); // newest → oldest
    const headCodename = cycle[0]?.codename ?? 'none';
    const purgedCodenames = cycle.map(c => c.codename);
    const purgedIds = new Set(cycle.map(c => c.id));
    // Remove checkpoints
    store.checkpoints = store.checkpoints.filter(c => !purgedIds.has(c.id));
    // Remove index entries
    for (const cp of cycle) {
        delete store.index[cp.codename];
        delete store.index[cp.id];
    }
    // Reset HEAD
    store.head = null;
    // Archive a slim record
    const record = {
        commitHash,
        committedAt: new Date().toISOString(),
        message: commitMessage,
        headCodename,
        purgedCodenames,
    };
    store.committed = [...(store.committed ?? []), record];
    // Delete the changes/ directory containing the specific diff hunks
    const changesDir = path.join(storeDir(rootDir), 'changes');
    if (fs.existsSync(changesDir)) {
        try {
            fs.rmSync(changesDir, { recursive: true, force: true });
        }
        catch { }
    }
    saveStore(rootDir, store);
    return { deleted: purgedCodenames, commitHash, archivedAs: record };
}
/** Get the latest git commit hash + message in rootDir (returns null if not a git repo) */
function getLatestGitCommit(rootDir) {
    try {
        const { execSync } = require('child_process');
        const hash = execSync('git rev-parse HEAD', { cwd: rootDir, stdio: 'pipe' })
            .toString().trim();
        const message = execSync('git log -1 --pretty=%s', { cwd: rootDir, stdio: 'pipe' })
            .toString().trim();
        return { hash, message };
    }
    catch {
        return null;
    }
}
/** Install a post-commit git hook that auto-purges checkpoints */
function installGitHook(rootDir) {
    const hookDir = path.join(rootDir, '.git', 'hooks');
    const hookPath = path.join(hookDir, 'post-commit');
    if (!fs.existsSync(hookDir)) {
        throw new Error(`No .git/hooks directory found in ${rootDir}. Is this a git repo?`);
    }
    const script = [
        '#!/bin/sh',
        '# Auto-generated by vela — removes local snapshots after commit',
        '# Remove this file to disable auto-purge on commit',
        `node "$(npm root -g 2>/dev/null)/vela/dist/cli.js" commit-purge . --hook 2>&1 | sed 's/^/[vela] /'`,
        `# fallback: try local node_modules`,
        `[ $? -ne 0 ] && node "$(pwd)/node_modules/vela/dist/cli.js" commit-purge . --hook 2>&1 | sed 's/^/[vela] /'`,
        'exit 0',
    ].join('\n') + '\n';
    fs.writeFileSync(hookPath, script, { mode: 0o755 });
    return hookPath;
}
