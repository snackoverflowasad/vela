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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodebaseWatcher = void 0;
const path = __importStar(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const snapshot_1 = require("./snapshot");
const filters_1 = require("./filters");
function sessionId() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}
function shouldIgnore(filePath, opts, storageDir) {
    const parts = filePath.split(path.sep);
    const ignoreDirs = (0, filters_1.buildIgnoreDirs)(opts);
    // Ignore our own storage dir
    if (filePath.startsWith(path.resolve(storageDir)))
        return true;
    for (const part of parts) {
        if (ignoreDirs.has(part))
            return true;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (opts.ignoreBinaryExtensions !== false && filters_1.BINARY_EXTENSIONS.has(ext))
        return true;
    if (opts.includeExtensions && !opts.includeExtensions.includes(ext))
        return true;
    return false;
}
class CodebaseWatcher {
    session;
    storageDir;
    opts;
    watcher;
    rootDir;
    constructor(rootDir, opts = {}) {
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
    start() {
        console.error(`[codebase-watcher] Session "${this.session.label}" started`);
        console.error(`[codebase-watcher] Watching: ${this.rootDir}`);
        console.error(`[codebase-watcher] Storage:  ${this.storageDir}\n`);
        this.watcher = chokidar_1.default.watch(this.rootDir, {
            persistent: true,
            ignoreInitial: false,
            ignored: (filePath) => shouldIgnore(filePath, this.opts, this.storageDir),
        });
        // On startup: snapshot every existing file as "before"
        this.watcher.on('add', (filePath) => {
            if (!this.session.before[filePath]) {
                const snap = (0, snapshot_1.snapshotFile)(filePath);
                if (snap)
                    this.session.before[filePath] = snap;
            }
        });
        // On change: capture "after" state
        this.watcher.on('change', (filePath) => {
            // Ensure we have a before snapshot
            if (!this.session.before[filePath]) {
                const snap = (0, snapshot_1.snapshotFile)(filePath);
                if (snap)
                    this.session.before[filePath] = snap;
            }
            const snap = (0, snapshot_1.snapshotFile)(filePath);
            if (snap) {
                this.session.after[filePath] = snap;
                console.error(`[codebase-watcher] changed  ${path.relative(this.rootDir, filePath)}`);
                this.opts.onChange?.(filePath, 'change');
                this._persist();
            }
        });
        // On delete: record that file was removed
        this.watcher.on('unlink', (filePath) => {
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
    async stop() {
        await this.watcher?.close();
        this.session.endedAt = new Date().toISOString();
        const outPath = this._persist();
        console.error(`\n[codebase-watcher] Session ended. Saved to: ${outPath}`);
        return outPath;
    }
    getSession() {
        return this.session;
    }
    _persist() {
        return (0, snapshot_1.saveSession)(this.session, this.storageDir);
    }
}
exports.CodebaseWatcher = CodebaseWatcher;
