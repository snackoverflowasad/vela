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
exports.snapshotFile = snapshotFile;
exports.saveSession = saveSession;
exports.loadSession = loadSession;
exports.listSessions = listSessions;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
function hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}
function snapshotFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return {
            file: filePath,
            capturedAt: new Date().toISOString(),
            hash: hashContent(content),
            lines: content.split('\n'),
        };
    }
    catch {
        return null; // file may not exist yet (new file)
    }
}
function saveSession(session, storageDir) {
    fs.mkdirSync(storageDir, { recursive: true });
    const sessionPath = path.join(storageDir, `${session.id}.json`);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf8');
    return sessionPath;
}
function loadSession(sessionPath) {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
}
function listSessions(storageDir) {
    if (!fs.existsSync(storageDir))
        return [];
    return fs
        .readdirSync(storageDir)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(storageDir, f))
        .sort(); // chronological by session id (timestamp-based)
}
