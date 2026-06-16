import { Store, Checkpoint } from './store';
/**
 * Writes CLAUDE.md and injects instructions for Cursor, Copilot, and Windsurf.
 * This ensures any AI IDE/agent in use can discover checkpoints and perform rollbacks.
 */
export declare function writeClaudeMd(rootDir: string, store: Store): void;
/**
 * Generates a rollback plan as structured JSON that any AI agent can parse.
 * This is what Claude Code / Cursor would read to perform the restore.
 */
export declare function generateRollbackPlan(checkpoint: Checkpoint, rootDir: string): RollbackPlan;
export interface RollbackOp {
    file: string;
    absolutePath: string;
    action: 'overwrite' | 'create' | 'delete';
    fromLines: number;
    toLines: number;
    contentPreview: string;
}
export interface RollbackPlan {
    checkpointId: string;
    codename: string;
    intent: string;
    description: string;
    operations: RollbackOp[];
    aiInstructions: string;
}
//# sourceMappingURL=ai-bridge.d.ts.map