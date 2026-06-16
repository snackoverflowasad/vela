export interface LineEntry {
    /** Absolute path of the file */
    file: string;
    /** 1-based line number */
    lineNumber: number;
    /** Raw line content (no newline) */
    content: string;
}
export interface FileEntry {
    /** Absolute path of the file */
    file: string;
    /** Total lines read */
    totalLines: number;
}
/**
 * Yields LineEntry objects for every line in the given file.
 */
export declare function readFileLines(filePath: string): AsyncGenerator<LineEntry>;
//# sourceMappingURL=reader.d.ts.map