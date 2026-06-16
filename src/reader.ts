import * as fs from 'fs';
import * as readline from 'readline';

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
export async function* readFileLines(filePath: string): AsyncGenerator<LineEntry> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    yield { file: filePath, lineNumber, content: line };
  }
}
