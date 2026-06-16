"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BINARY_EXTENSIONS = exports.DEFAULT_IGNORE_DIRS = void 0;
exports.buildIgnoreDirs = buildIgnoreDirs;
exports.DEFAULT_IGNORE_DIRS = new Set([
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    '__pycache__',
    '.cache',
    'coverage',
    '.nyc_output',
    'vendor',
]);
exports.BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
    '.mp3', '.mp4', '.wav', '.ogg', '.flac',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.ttf', '.woff', '.woff2', '.eot',
    '.db', '.sqlite', '.lock',
]);
function buildIgnoreDirs(opts) {
    if (opts.customIgnoreDirs)
        return new Set(opts.customIgnoreDirs);
    const merged = new Set(exports.DEFAULT_IGNORE_DIRS);
    for (const d of opts.ignoreDirs ?? [])
        merged.add(d);
    return merged;
}
