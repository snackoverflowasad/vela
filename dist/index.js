"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRollbackPlan = exports.writeClaudeMd = exports.installGitHook = exports.getLatestGitCommit = exports.purgeAfterCommit = exports.captureFile = exports.getHistory = exports.restoreCheckpoint = exports.resolveCheckpoint = exports.createCheckpoint = exports.saveStore = exports.loadStore = exports.initStore = exports.CodebaseWatcher = exports.renderDiff = exports.diffSession = exports.diffSnapshots = exports.listSessions = exports.loadSession = exports.saveSession = exports.snapshotFile = exports.BINARY_EXTENSIONS = exports.DEFAULT_IGNORE_DIRS = void 0;
exports.readCodebase = readCodebase;
exports.scanCodebase = scanCodebase;
const walker_1 = require("./walker");
const reader_1 = require("./reader");
var filters_1 = require("./filters");
Object.defineProperty(exports, "DEFAULT_IGNORE_DIRS", { enumerable: true, get: function () { return filters_1.DEFAULT_IGNORE_DIRS; } });
Object.defineProperty(exports, "BINARY_EXTENSIONS", { enumerable: true, get: function () { return filters_1.BINARY_EXTENSIONS; } });
var snapshot_1 = require("./snapshot");
Object.defineProperty(exports, "snapshotFile", { enumerable: true, get: function () { return snapshot_1.snapshotFile; } });
Object.defineProperty(exports, "saveSession", { enumerable: true, get: function () { return snapshot_1.saveSession; } });
Object.defineProperty(exports, "loadSession", { enumerable: true, get: function () { return snapshot_1.loadSession; } });
Object.defineProperty(exports, "listSessions", { enumerable: true, get: function () { return snapshot_1.listSessions; } });
var diff_1 = require("./diff");
Object.defineProperty(exports, "diffSnapshots", { enumerable: true, get: function () { return diff_1.diffSnapshots; } });
Object.defineProperty(exports, "diffSession", { enumerable: true, get: function () { return diff_1.diffSession; } });
Object.defineProperty(exports, "renderDiff", { enumerable: true, get: function () { return diff_1.renderDiff; } });
var watcher_1 = require("./watcher");
Object.defineProperty(exports, "CodebaseWatcher", { enumerable: true, get: function () { return watcher_1.CodebaseWatcher; } });
var store_1 = require("./store");
Object.defineProperty(exports, "initStore", { enumerable: true, get: function () { return store_1.initStore; } });
Object.defineProperty(exports, "loadStore", { enumerable: true, get: function () { return store_1.loadStore; } });
Object.defineProperty(exports, "saveStore", { enumerable: true, get: function () { return store_1.saveStore; } });
Object.defineProperty(exports, "createCheckpoint", { enumerable: true, get: function () { return store_1.createCheckpoint; } });
Object.defineProperty(exports, "resolveCheckpoint", { enumerable: true, get: function () { return store_1.resolveCheckpoint; } });
Object.defineProperty(exports, "restoreCheckpoint", { enumerable: true, get: function () { return store_1.restoreCheckpoint; } });
Object.defineProperty(exports, "getHistory", { enumerable: true, get: function () { return store_1.getHistory; } });
Object.defineProperty(exports, "captureFile", { enumerable: true, get: function () { return store_1.captureFile; } });
Object.defineProperty(exports, "purgeAfterCommit", { enumerable: true, get: function () { return store_1.purgeAfterCommit; } });
Object.defineProperty(exports, "getLatestGitCommit", { enumerable: true, get: function () { return store_1.getLatestGitCommit; } });
Object.defineProperty(exports, "installGitHook", { enumerable: true, get: function () { return store_1.installGitHook; } });
var ai_bridge_1 = require("./ai-bridge");
Object.defineProperty(exports, "writeClaudeMd", { enumerable: true, get: function () { return ai_bridge_1.writeClaudeMd; } });
Object.defineProperty(exports, "generateRollbackPlan", { enumerable: true, get: function () { return ai_bridge_1.generateRollbackPlan; } });
async function* readCodebase(rootDir, opts = {}) {
    for await (const filePath of (0, walker_1.walkDir)(rootDir, opts)) {
        opts.onFileStart?.(filePath);
        let lineCount = 0;
        for await (const line of (0, reader_1.readFileLines)(filePath)) {
            lineCount++;
            if (opts.onLine)
                await opts.onLine(line);
            yield line;
        }
        opts.onFileEnd?.({ file: filePath, totalLines: lineCount });
    }
}
async function scanCodebase(rootDir, opts = {}) {
    const start = Date.now();
    let totalFiles = 0, totalLines = 0;
    for await (const line of readCodebase(rootDir, opts)) {
        if (line.lineNumber === 1)
            totalFiles++;
        totalLines++;
    }
    const stats = { totalFiles, totalLines, durationMs: Date.now() - start };
    opts.onDone?.(stats);
    return stats;
}
