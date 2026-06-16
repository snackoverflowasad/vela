export interface FileState {
    path: string;
    content: string;
    hash: string;
    lines: number;
}
export interface Checkpoint {
    id: string;
    codename: string;
    description: string;
    intent: string;
    createdAt: string;
    rootDir: string;
    files: Record<string, FileState>;
    tags: string[];
    parent?: string;
}
export interface Store {
    version: number;
    rootDir: string;
    checkpoints: Checkpoint[];
    head: string | null;
    index: Record<string, string>;
    committed: CommitRecord[];
    targets?: string[];
}
export declare function storeDir(rootDir: string): string;
export declare function storePath(rootDir: string): string;
export declare function initStore(rootDir: string, targets?: string[]): Store;
export declare function loadStore(rootDir: string): Store;
export declare function saveStore(rootDir: string, store: Store): void;
export declare function makeId(): string;
export declare function generateCodename(intent: string, id: string): string;
export declare function captureFile(filePath: string, rootDir: string): FileState | null;
export declare function createCheckpoint(rootDir: string, store: Store, opts: {
    intent: string;
    description: string;
    filePaths: string[];
    tags?: string[];
}): Checkpoint;
/** Resolve a codename OR id OR partial match → Checkpoint */
export declare function resolveCheckpoint(store: Store, ref: string): Checkpoint | null;
/** Restore all files from a checkpoint to disk */
export declare function restoreCheckpoint(checkpoint: Checkpoint, rootDir: string): string[];
/** Get the chain of checkpoints from HEAD back to the first */
export declare function getHistory(store: Store): Checkpoint[];
export interface PurgeResult {
    /** Codenames that were deleted */
    deleted: string[];
    /** Commit hash that triggered the purge */
    commitHash: string;
    /** The single "committed" record kept in the archive */
    archivedAs: CommitRecord;
}
export interface CommitRecord {
    commitHash: string;
    committedAt: string;
    message: string;
    /** The HEAD codename at the time of commit — what got baked into git */
    headCodename: string;
    /** All codenames that were purged */
    purgedCodenames: string[];
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
export declare function purgeAfterCommit(rootDir: string, store: Store, commitHash: string, commitMessage: string): PurgeResult;
/** Get the latest git commit hash + message in rootDir (returns null if not a git repo) */
export declare function getLatestGitCommit(rootDir: string): {
    hash: string;
    message: string;
} | null;
/** Install a post-commit git hook that auto-purges checkpoints */
export declare function installGitHook(rootDir: string): string;
//# sourceMappingURL=store.d.ts.map