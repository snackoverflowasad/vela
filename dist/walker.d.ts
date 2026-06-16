import { FilterOptions } from './filters';
export interface WalkOptions extends FilterOptions {
}
/**
 * Recursively yields all file paths under `rootDir`,
 * honouring ignore rules and extension filters.
 */
export declare function walkDir(rootDir: string, opts?: WalkOptions): AsyncGenerator<string>;
//# sourceMappingURL=walker.d.ts.map