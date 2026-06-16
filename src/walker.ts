import * as fs from 'fs';
import * as path from 'path';
import { BINARY_EXTENSIONS, FilterOptions, buildIgnoreDirs } from './filters';

export interface WalkOptions extends FilterOptions {}

/**
 * Recursively yields all file paths under `rootDir`,
 * honouring ignore rules and extension filters.
 */
export async function* walkDir(
  rootDir: string,
  opts: WalkOptions = {}
): AsyncGenerator<string> {
  const ignoreDirs = buildIgnoreDirs(opts);
  const maxSize = opts.maxFileSizeBytes ?? 1_048_576; // 1 MB default

  async function* recurse(dir: string): AsyncGenerator<string> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable dirs
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          yield* recurse(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Skip binary extensions
        if (opts.ignoreBinaryExtensions !== false && BINARY_EXTENSIONS.has(ext)) {
          continue;
        }

        // Include extension filter
        if (opts.includeExtensions && !opts.includeExtensions.includes(ext)) {
          continue;
        }

        // Skip files that are too large
        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.size > maxSize) continue;
        } catch {
          continue;
        }

        yield fullPath;
      }
    }
  }

  yield* recurse(path.resolve(rootDir));
}
