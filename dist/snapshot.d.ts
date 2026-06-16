export interface FileSnapshot {
    file: string;
    capturedAt: string;
    hash: string;
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
export declare function snapshotFile(filePath: string): FileSnapshot | null;
export declare function saveSession(session: Session, storageDir: string): string;
export declare function loadSession(sessionPath: string): Session;
export declare function listSessions(storageDir: string): string[];
//# sourceMappingURL=snapshot.d.ts.map