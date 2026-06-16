import * as path from 'path';
import * as crypto from 'crypto';
import chokidar from 'chokidar';
import { Session, FileSnapshot, snapshotFile, saveSession } from './snapshot';
import { buildIgnoreDirs, BINARY_EXTENSIONS, FilterOptions } from './filters';

export interface WatcherOptions extends FilterOptions {
  /** Directory to persist session JSON files (default: .codebase-reader) */
  storageDir?: string;
  /** Human-readable label for this session (default: timestamp) */
  label?: string;
  /** Called whenever a file change is recorded */
  onChange?: (file: string, type: 'add' | 'change' | 'unlink') => void;
}

function sessionId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shouldIgnore(filePath: string, opts: FilterOptions, storageDir: string): boolean {
  const parts = filePath.split(path.sep);
  const ignoreDirs = buildIgnoreDirs(opts);

  // Ignore our own storage dir
  if (filePath.startsWith(path.resolve(storageDir))) return true;

  for (const part of parts) {
    if (ignoreDirs.has(part)) return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (opts.ignoreBinaryExtensions !== false && BINARY_EXTENSIONS.has(ext)) return true;
  if (opts.includeExtensions && !opts.includeExtensions.includes(ext)) return true;

  return false;
}

export class CodebaseWatcher {
  private session: Session;
  private storageDir: string;
  private opts: WatcherOptions;
  private watcher?: ReturnType<typeof chokidar.watch>;
  private rootDir: string;

  constructor(rootDir: string, opts: WatcherOptions = {}) {
    this.rootDir = path.resolve(rootDir);
    this.opts = opts;
    this.storageDir = path.resolve(opts.storageDir ?? path.join(rootDir, '.codebase-reader'));

    const id = sessionId();
    this.session = {
      id,
      label: opts.label ?? `Session ${id}`,
      startedAt: new Date().toISOString(),
      rootDir: this.rootDir,
      before: {},
      after: {},
    };
  }

  /**
   * Start watching. Snapshots the current state of every watched file immediately,
   * then tracks changes as they happen.
   */
  start(): this {
    console.error(`[codebase-watcher] Session "${this.session.label}" started`);
    console.error(`[codebase-watcher] Watching: ${this.rootDir}`);
    console.error(`[codebase-watcher] Storage:  ${this.storageDir}\n`);

    this.watcher = chokidar.watch(this.rootDir, {
      persistent: true,
      ignoreInitial: false,
      ignored: (filePath: string) => shouldIgnore(filePath, this.opts, this.storageDir),
    });

    // On startup: snapshot every existing file as "before"
    this.watcher.on('add', (filePath: string) => {
      if (!this.session.before[filePath]) {
        const snap = snapshotFile(filePath);
        if (snap) this.session.before[filePath] = snap;
      }
    });

    // On change: capture "after" state
    this.watcher.on('change', (filePath: string) => {
      // Ensure we have a before snapshot
      if (!this.session.before[filePath]) {
        const snap = snapshotFile(filePath);
        if (snap) this.session.before[filePath] = snap;
      }

      const snap = snapshotFile(filePath);
      if (snap) {
        this.session.after[filePath] = snap;
        console.error(`[codebase-watcher] changed  ${path.relative(this.rootDir, filePath)}`);
        this.opts.onChange?.(filePath, 'change');
        this._persist();
      }
    });

    // On delete: record that file was removed
    this.watcher.on('unlink', (filePath: string) => {
      if (!this.session.before[filePath]) {
        // We didn't catch the initial snapshot — record as unknown
        this.session.before[filePath] = {
          file: filePath,
          capturedAt: this.session.startedAt,
          hash: 'unknown',
          lines: [],
        };
      }
      // after = null means deleted; we mark with empty sentinel
      this.session.after[filePath] = {
        file: filePath,
        capturedAt: new Date().toISOString(),
        hash: '__deleted__',
        lines: [],
      };
      console.error(`[codebase-watcher] deleted  ${path.relative(this.rootDir, filePath)}`);
      this.opts.onChange?.(filePath, 'unlink');
      this._persist();
    });

    return this;
  }

  /** Stop watching and finalize the session */
  async stop(): Promise<string> {
    await this.watcher?.close();
    this.session.endedAt = new Date().toISOString();
    const outPath = this._persist();
    console.error(`\n[codebase-watcher] Session ended. Saved to: ${outPath}`);
    return outPath;
  }

  getSession(): Session {
    return this.session;
  }

  private _persist(): string {
    return saveSession(this.session, this.storageDir);
  }
}
