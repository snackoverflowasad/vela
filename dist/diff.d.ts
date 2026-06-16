import { FileSnapshot, Session } from './snapshot';
export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';
export interface LineDiff {
    lineNumber: number;
    type: 'added' | 'removed' | 'context';
    content: string;
}
export interface FileDiff {
    file: string;
    changeType: ChangeType;
    linesAdded: number;
    linesRemoved: number;
    hunks: DiffHunk[];
}
export interface DiffHunk {
    oldStart: number;
    newStart: number;
    lines: LineDiff[];
}
export interface SessionDiff {
    sessionId: string;
    label: string;
    startedAt: string;
    endedAt?: string;
    files: FileDiff[];
    totalAdded: number;
    totalRemoved: number;
    totalFilesChanged: number;
}
/** Build a FileDiff comparing two snapshots (either can be null for new/deleted files) */
export declare function diffSnapshots(before: FileSnapshot | null, after: FileSnapshot | null, filePath: string): FileDiff;
/** Compute the full diff for an entire session */
export declare function diffSession(session: Session): SessionDiff;
/** Render a SessionDiff as a human-readable unified-diff string */
export declare function renderDiff(sd: SessionDiff, { color }?: {
    color?: boolean | undefined;
}): string;
//# sourceMappingURL=diff.d.ts.map