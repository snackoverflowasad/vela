import { WalkOptions } from './walker';
import { LineEntry, FileEntry } from './reader';
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
export interface CodebaseStats {
    totalFiles: number;
    totalLines: number;
    durationMs: number;
}
export declare function readCodebase(rootDir: string, opts?: ReadCodebaseOptions): AsyncGenerator<LineEntry>;
export declare function scanCodebase(rootDir: string, opts?: ReadCodebaseOptions): Promise<CodebaseStats>;
//# sourceMappingURL=index.d.ts.map