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
exports.walkDir = walkDir;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const filters_1 = require("./filters");
/**
 * Recursively yields all file paths under `rootDir`,
 * honouring ignore rules and extension filters.
 */
async function* walkDir(rootDir, opts = {}) {
    const ignoreDirs = (0, filters_1.buildIgnoreDirs)(opts);
    const maxSize = opts.maxFileSizeBytes ?? 1_048_576; // 1 MB default
    async function* recurse(dir) {
        let entries;
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        }
        catch {
            return; // skip unreadable dirs
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!ignoreDirs.has(entry.name)) {
                    yield* recurse(fullPath);
                }
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                // Skip binary extensions
                if (opts.ignoreBinaryExtensions !== false && filters_1.BINARY_EXTENSIONS.has(ext)) {
                    continue;
                }
                // Include extension filter
                if (opts.includeExtensions && !opts.includeExtensions.includes(ext)) {
                    continue;
                }
                // Skip files that are too large
                try {
                    const stat = await fs.promises.stat(fullPath);
                    if (stat.size > maxSize)
                        continue;
                }
                catch {
                    continue;
                }
                yield fullPath;
            }
        }
    }
    yield* recurse(path.resolve(rootDir));
}
