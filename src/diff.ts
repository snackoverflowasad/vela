import * as Diff from 'diff';
import { FileSnapshot, Session } from './snapshot';

export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface LineDiff {
  lineNumber: number;   // line number in the NEW file (added/unchanged), or OLD file (removed)
  type: 'added' | 'removed' | 'context';
  content: string;
}

export interface FileDiff {
  file: string;
  changeType: ChangeType;
  linesAdded: number;
  linesRemoved: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: LineDiff[];
}

export interface SessionDiff {
  sessionId: string;
  label: string;
  startedAt: string;
  endedAt?: string;
  files: FileDiff[];
  totalAdded: number;
  totalRemoved: number;
  totalFilesChanged: number;
}

/** Build a FileDiff comparing two snapshots (either can be null for new/deleted files) */
export function diffSnapshots(
  before: FileSnapshot | null,
  after: FileSnapshot | null,
  filePath: string
): FileDiff {
  const beforeContent = before?.lines.join('\n') ?? '';
  const afterContent = after?.lines.join('\n') ?? '';

  if (!before && after) {
    // New file
    const lines: LineDiff[] = after.lines.map((content, i) => ({
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
    const lines: LineDiff[] = before.lines.map((content, i) => ({
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

  const hunks: DiffHunk[] = rawDiff.hunks.map((hunk: any) => {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    const lines: LineDiff[] = [];

    for (const line of hunk.lines) {
      if (line.startsWith('+')) {
        lines.push({ lineNumber: newLine, type: 'added', content: line.slice(1) });
        newLine++;
        totalAdded++;
      } else if (line.startsWith('-')) {
        lines.push({ lineNumber: oldLine, type: 'removed', content: line.slice(1) });
        oldLine++;
        totalRemoved++;
      } else {
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
export function diffSession(session: Session): SessionDiff {
  const allFiles = new Set([
    ...Object.keys(session.before),
    ...Object.keys(session.after),
  ]);

  const files: FileDiff[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const file of allFiles) {
    const fd = diffSnapshots(
      session.before[file] ?? null,
      session.after[file] ?? null,
      file
    );
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
export function renderDiff(sd: SessionDiff, { color = true } = {}): string {
  const c = color
    ? { add: '\x1b[32m', rem: '\x1b[31m', hdr: '\x1b[36m', dim: '\x1b[2m', rst: '\x1b[0m' }
    : { add: '', rem: '', hdr: '', dim: '', rst: '' };

  const lines: string[] = [];
  lines.push(`${c.hdr}Session: ${sd.label} [${sd.sessionId}]${c.rst}`);
  lines.push(`${c.dim}${sd.startedAt} → ${sd.endedAt ?? 'in progress'}${c.rst}`);
  lines.push(`${c.add}+${sd.totalAdded}${c.rst}  ${c.rem}-${sd.totalRemoved}${c.rst}  across ${sd.totalFilesChanged} file(s)\n`);

  for (const fd of sd.files) {
    const tag =
      fd.changeType === 'added' ? `${c.add}[NEW]${c.rst}` :
      fd.changeType === 'removed' ? `${c.rem}[DEL]${c.rst}` :
      `${c.hdr}[MOD]${c.rst}`;

    lines.push(`${tag} ${fd.file}  ${c.add}+${fd.linesAdded}${c.rst} ${c.rem}-${fd.linesRemoved}${c.rst}`);

    for (const hunk of fd.hunks) {
      lines.push(`${c.dim}@@ -${hunk.oldStart} +${hunk.newStart} @@${c.rst}`);
      for (const line of hunk.lines) {
        if (line.type === 'added')   lines.push(`${c.add}+ ${String(line.lineNumber).padStart(4)}  ${line.content}${c.rst}`);
        else if (line.type === 'removed') lines.push(`${c.rem}- ${String(line.lineNumber).padStart(4)}  ${line.content}${c.rst}`);
        else lines.push(`${c.dim}  ${String(line.lineNumber).padStart(4)}  ${line.content}${c.rst}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
