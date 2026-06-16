import { walkDir, WalkOptions } from './walker';
import { readFileLines, LineEntry, FileEntry } from './reader';

export type { LineEntry, FileEntry, WalkOptions };
export { DEFAULT_IGNORE_DIRS, BINARY_EXTENSIONS } from './filters';
export { snapshotFile, saveSession, loadSession, listSessions } from './snapshot';
export type { FileSnapshot, Session } from './snapshot';
export { diffSnapshots, diffSession, renderDiff } from './diff';
export type { FileDiff, SessionDiff, DiffHunk, LineDiff, ChangeType } from './diff';
export { CodebaseWatcher } from './watcher';
export type { WatcherOptions } from './watcher';
export { initStore, loadStore, saveStore, createCheckpoint, resolveCheckpoint, restoreCheckpoint, getHistory, captureFile, purgeAfterCommit, getLatestGitCommit, installGitHook } from './store';
export type { Checkpoint, Store, FileState, PurgeResult, CommitRecord } from './store';
export { writeClaudeMd, generateRollbackPlan } from './ai-bridge';
export type { RollbackPlan, RollbackOp } from './ai-bridge';

export interface ReadCodebaseOptions extends WalkOptions {
  onFileStart?: (file: string) => void;
  onFileEnd?: (entry: FileEntry) => void;
  onLine?: (line: LineEntry) => void | Promise<void>;
  onDone?: (stats: CodebaseStats) => void;
}
export interface CodebaseStats { totalFiles: number; totalLines: number; durationMs: number; }

export async function* readCodebase(rootDir: string, opts: ReadCodebaseOptions = {}): AsyncGenerator<LineEntry> {
  for await (const filePath of walkDir(rootDir, opts)) {
    opts.onFileStart?.(filePath);
    let lineCount = 0;
    for await (const line of readFileLines(filePath)) {
      lineCount++;
      if (opts.onLine) await opts.onLine(line);
      yield line;
    }
    opts.onFileEnd?.({ file: filePath, totalLines: lineCount });
  }
}

export async function scanCodebase(rootDir: string, opts: ReadCodebaseOptions = {}): Promise<CodebaseStats> {
  const start = Date.now();
  let totalFiles = 0, totalLines = 0;
  for await (const line of readCodebase(rootDir, opts)) {
    if (line.lineNumber === 1) totalFiles++;
    totalLines++;
  }
  const stats = { totalFiles, totalLines, durationMs: Date.now() - start };
  opts.onDone?.(stats);
  return stats;
}
