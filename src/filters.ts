export const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.cache',
  'coverage',
  '.nyc_output',
  'vendor',
]);

export const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.ttf', '.woff', '.woff2', '.eot',
  '.db', '.sqlite', '.lock',
]);

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

export function buildIgnoreDirs(opts: FilterOptions): Set<string> {
  if (opts.customIgnoreDirs) return new Set(opts.customIgnoreDirs);
  const merged = new Set(DEFAULT_IGNORE_DIRS);
  for (const d of opts.ignoreDirs ?? []) merged.add(d);
  return merged;
}
