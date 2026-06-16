import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileSnapshot {
  file: string;
  capturedAt: string; // ISO timestamp
  hash: string;       // sha256 of content
  lines: string[];
}

export interface Session {
  id: string;
  label: string;
  startedAt: string;
  endedAt?: string;
  rootDir: string;
  /** Map of absolute file path → snapshot */
  before: Record<string, FileSnapshot>;
  after: Record<string, FileSnapshot>;
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

export function snapshotFile(filePath: string): FileSnapshot | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      file: filePath,
      capturedAt: new Date().toISOString(),
      hash: hashContent(content),
      lines: content.split('\n'),
    };
  } catch {
    return null; // file may not exist yet (new file)
  }
}

export function saveSession(session: Session, storageDir: string): string {
  fs.mkdirSync(storageDir, { recursive: true });
  const sessionPath = path.join(storageDir, `${session.id}.json`);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf8');
  return sessionPath;
}

export function loadSession(sessionPath: string): Session {
  return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
}

export function listSessions(storageDir: string): string[] {
  if (!fs.existsSync(storageDir)) return [];
  return fs
    .readdirSync(storageDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(storageDir, f))
    .sort(); // chronological by session id (timestamp-based)
}
