export declare const DEFAULT_IGNORE_DIRS: Set<string>;
export declare const BINARY_EXTENSIONS: Set<string>;
export interface FilterOptions {
    /** Additional directories to ignore (merged with defaults) */
    ignoreDirs?: string[];
    /** Replace default ignore dirs entirely */
    customIgnoreDirs?: string[];
    /** Additional binary extensions to skip */
    ignoreBinaryExtensions?: boolean;
    /** Only include files matching these extensions (e.g. ['.ts', '.js']) */
    includeExtensions?: string[];
    /** Max file size in bytes to read (default: 1MB) */
    maxFileSizeBytes?: number;
}
export declare function buildIgnoreDirs(opts: FilterOptions): Set<string>;
//# sourceMappingURL=filters.d.ts.map