import { Session } from './snapshot';
import { FilterOptions } from './filters';
export interface WatcherOptions extends FilterOptions {
    /** Directory to persist session JSON files (default: .codebase-reader) */
    storageDir?: string;
    /** Human-readable label for this session (default: timestamp) */
    label?: string;
    /** Called whenever a file change is recorded */
    onChange?: (file: string, type: 'add' | 'change' | 'unlink') => void;
}
export declare class CodebaseWatcher {
    private session;
    private storageDir;
    private opts;
    private watcher?;
    private rootDir;
    constructor(rootDir: string, opts?: WatcherOptions);
    /**
     * Start watching. Snapshots the current state of every watched file immediately,
     * then tracks changes as they happen.
     */
    start(): this;
    /** Stop watching and finalize the session */
    stop(): Promise<string>;
    getSession(): Session;
    private _persist;
}
//# sourceMappingURL=watcher.d.ts.map