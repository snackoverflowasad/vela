import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileState {
  path: string;       // relative to rootDir
  content: string;    // full file content
  hash: string;       // sha256 short
  lines: number;
}

export interface Checkpoint {
  id: string;                  // e.g. "chk_7f3a"
  codename: string;            // AI-readable e.g. "aurora-refactor-greet"
  description: string;         // what changed, in plain English
  intent: string;              // original user request / feature label
  createdAt: string;
  rootDir: string;
  files: Record<string, FileState>;   // relative path → state
  tags: string[];              // e.g. ["feature", "auth", "dark-mode"]
  parent?: string;             // previous checkpoint id (chain)
}

export interface Store {
  version: number;
  rootDir: string;
  checkpoints: Checkpoint[];
  head: string | null;         // current checkpoint id
  index: Record<string, string>; // codename → id (for fast lookup)
  committed: CommitRecord[];   // audit trail of purged cycles
  targets?: string[];          // list of targeted IDEs/agents
}

const STORE_FILE = 'store.json';
const STORE_DIR_NAME = '.vela';

// ── Paths ──────────────────────────────────────────────────────────────────

export function storeDir(rootDir: string): string {
  return path.join(path.resolve(rootDir), STORE_DIR_NAME);
}

export function storePath(rootDir: string): string {
  return path.join(storeDir(rootDir), STORE_FILE);
}

// ── Init / Load / Save ────────────────────────────────────────────────────

export function initStore(rootDir: string, targets?: string[]): Store {
  const dir = storeDir(rootDir);
  const file = storePath(rootDir);

  fs.mkdirSync(dir, { recursive: true });

  // Write .gitignore so users don't accidentally commit snapshots
  const gi = path.join(dir, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, '*\n!.gitignore\n');

  if (fs.existsSync(file)) {
    const store = loadStore(rootDir);
    if (targets && targets.length > 0) {
      store.targets = targets;
      saveStore(rootDir, store);
    }
    return store;
  }

  const store: Store = {
    version: 1,
    rootDir: path.resolve(rootDir),
    checkpoints: [],
    head: null,
    index: {},
    committed: [],
    targets,
  };
  saveStore(rootDir, store);
  return store;
}

export function loadStore(rootDir: string): Store {
  const file = storePath(rootDir);
  if (!fs.existsSync(file)) return initStore(rootDir);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function saveStore(rootDir: string, store: Store): void {
  fs.mkdirSync(storeDir(rootDir), { recursive: true });
  fs.writeFileSync(storePath(rootDir), JSON.stringify(store, null, 2), 'utf8');
}

// ── ID / Codename helpers ─────────────────────────────────────────────────

export function makeId(): string {
  return 'chk_' + crypto.randomBytes(3).toString('hex');
}

/** 
 * Codenames are designed to be:
 * 1. Unique enough to avoid collision
 * 2. Semantically hintful — derived from the intent
 * 3. Stable — AI can refer to them consistently
 *
 * Format: <adjective>-<intent-slug>-<short-hash>
 * e.g.  "glacier-add-dark-mode-7f3a"
 */
const ADJECTIVES = [
  'amber','arctic','azure','blaze','bronze','cedar','cobalt','coral',
  'crimson','dawn','dusk','ember','flint','forge','frost','glacier',
  'granite','harbor','indigo','jade','lunar','maple','maroon','mist',
  'nova','obsidian','onyx','opal','prism','quartz','ruby','sage',
  'scarlet','slate','solar','steel','storm','teal','terra','timber',
  'topaz','twilight','ultra','umber','velvet','violet','walnut','zenith',
];

export function generateCodename(intent: string, id: string): string {
  const hash = id.replace('chk_', '');
  const adjIdx = parseInt(hash.slice(0, 2), 16) % ADJECTIVES.length;
  const adj = ADJECTIVES[adjIdx];
  const slug = intent
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-');
  return `${adj}-${slug}-${hash}`;
}

// ── File capture ──────────────────────────────────────────────────────────

export function captureFile(filePath: string, rootDir: string): FileState | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
    const relPath = path.relative(path.resolve(rootDir), filePath);
    return {
      path: relPath,
      content,
      hash,
      lines: content.split('\n').length,
    };
  } catch {
    return null;
  }
}

// ── Checkpoint operations ─────────────────────────────────────────────────

export function createCheckpoint(
  rootDir: string,
  store: Store,
  opts: {
    intent: string;
    description: string;
    filePaths: string[];   // absolute paths to capture
    tags?: string[];
  }
): Checkpoint {
  const id = makeId();
  const codename = generateCodename(opts.intent, id);

  const files: Record<string, FileState> = {};
  for (const fp of opts.filePaths) {
    const state = captureFile(fp, rootDir);
    if (state) files[state.path] = state;
  }

  const parentCheckpoint = store.head ? store.checkpoints.find(c => c.id === store.head) : null;
  const diffs: Record<string, any> = {};
  const { diffSnapshots } = require('./diff');

  for (const [relPath, newState] of Object.entries(files)) {
    const parentFile = parentCheckpoint?.files[relPath];
    const beforeSnap = parentFile && parentFile.content ? {
      file: path.join(rootDir, relPath),
      capturedAt: parentCheckpoint.createdAt,
      hash: parentFile.hash,
      lines: parentFile.content.split('\n'),
    } : null;

    const afterSnap = {
      file: path.join(rootDir, relPath),
      capturedAt: new Date().toISOString(),
      hash: newState.hash,
      lines: newState.content.split('\n'),
    };

    const fd = diffSnapshots(beforeSnap, afterSnap, path.join(rootDir, relPath));
    if (fd.changeType !== 'unchanged') {
      diffs[relPath] = fd;
    }
  }

  // Save changes under .vela/changes/<codename>.json (AI-readable format + full restore contents)
  const changesDir = path.join(storeDir(rootDir), 'changes');
  fs.mkdirSync(changesDir, { recursive: true });
  fs.writeFileSync(
    path.join(changesDir, `${codename}.json`),
    JSON.stringify({
      id,
      codename,
      intent: opts.intent,
      description: opts.description,
      createdAt: new Date().toISOString(),
      changes: diffs,
      files,
    }, null, 2),
    'utf8'
  );

  // Strip content of older checkpoints to keep store.json extremely small
  for (const cp of store.checkpoints) {
    for (const fileState of Object.values(cp.files)) {
      fileState.content = '';
    }
  }

  const checkpoint: Checkpoint = {
    id,
    codename,
    description: opts.description,
    intent: opts.intent,
    createdAt: new Date().toISOString(),
    rootDir: path.resolve(rootDir),
    files,
    tags: opts.tags ?? [],
    parent: store.head ?? undefined,
  };

  store.checkpoints.push(checkpoint);
  store.index[codename] = id;
  store.index[id] = id;  // also index by id directly
  store.head = id;
  saveStore(rootDir, store);

  return checkpoint;
}

/** Resolve a codename OR id OR partial match → Checkpoint */
export function resolveCheckpoint(store: Store, ref: string): Checkpoint | null {
  const history = getHistory(store);
  if (history.length === 0) return null;

  const normalized = ref.toLowerCase().trim();

  // Alias checks
  if (normalized === 'last' || normalized === 'head' || normalized === 'latest') {
    return history[0];
  }
  if (normalized === 'prev') {
    return history[1] ?? null;
  }

  // Matches last~1, head~1, prev~1, last-1, head-1, prev-1
  const tildeDashMatch = normalized.match(/^(last|head|prev)[~-]([0-9]+)$/);
  if (tildeDashMatch) {
    const num = parseInt(tildeDashMatch[2], 10);
    const baseOffset = tildeDashMatch[1] === 'prev' ? 1 : 0;
    return history[num + baseOffset] ?? null;
  }

  // Matches ~1, ~2, etc.
  const tildeMatch = normalized.match(/^~([0-9]+)$/);
  if (tildeMatch) {
    const num = parseInt(tildeMatch[1], 10);
    return history[num - 1] ?? null;
  }

  // Exact id or codename
  const id = store.index[ref];
  if (id) return store.checkpoints.find(c => c.id === id) ?? null;

  // Partial match on codename
  const partial = store.checkpoints.find(c => c.codename.includes(ref));
  if (partial) return partial;

  return null;
}

/** Restore all files from a checkpoint to disk */
export function restoreCheckpoint(checkpoint: Checkpoint, rootDir: string): string[] {
  const restored: string[] = [];

  // Try loading content from changes file if store has it stripped
  let fullFiles: Record<string, any> = {};
  const changesPath = path.join(storeDir(rootDir), 'changes', `${checkpoint.codename}.json`);
  if (fs.existsSync(changesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
      fullFiles = data.files || {};
    } catch {}
  }

  for (const [relPath, state] of Object.entries(checkpoint.files)) {
    const fullPath = path.join(path.resolve(rootDir), relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const content = state.content || fullFiles[relPath]?.content || '';
    fs.writeFileSync(fullPath, content, 'utf8');
    restored.push(fullPath);
  }
  return restored;
}

/** Get the chain of checkpoints from HEAD back to the first */
export function getHistory(store: Store): Checkpoint[] {
  const result: Checkpoint[] = [];
  let current = store.checkpoints.find(c => c.id === store.head);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    result.push(current);
    visited.add(current.id);
    current = store.checkpoints.find(c => c.id === current!.parent);
  }
  return result;
}

export interface PurgeResult {
  /** Codenames that were deleted */
  deleted: string[];
  /** Commit hash that triggered the purge */
  commitHash: string;
  /** The single "committed" record kept in the archive */
  archivedAs: CommitRecord;
}

export interface CommitRecord {
  commitHash: string;
  committedAt: string;
  message: string;
  /** The HEAD codename at the time of commit — what got baked into git */
  headCodename: string;
  /** All codenames that were purged */
  purgedCodenames: string[];
}

/**
 * Purge all current checkpoints after a git commit.
 *
 * Keeps a lightweight CommitRecord in store.committed[] so you still have
 * an audit trail of *which* codename was committed, but the full file
 * content snapshots are gone.
 *
 * Logic:
 *  - Walk the parent chain from HEAD — those are the "cycle" checkpoints
 *  - Delete them all from store.checkpoints + store.index
 *  - Reset store.head to null (clean slate)
 *  - Push a CommitRecord to store.committed[]
 */
export function purgeAfterCommit(
  rootDir: string,
  store: Store,
  commitHash: string,
  commitMessage: string
): PurgeResult {
  const cycle = getHistory(store); // newest → oldest
  const headCodename = cycle[0]?.codename ?? 'none';
  const purgedCodenames = cycle.map(c => c.codename);
  const purgedIds = new Set(cycle.map(c => c.id));

  // Remove checkpoints
  store.checkpoints = store.checkpoints.filter(c => !purgedIds.has(c.id));

  // Remove index entries
  for (const cp of cycle) {
    delete store.index[cp.codename];
    delete store.index[cp.id];
  }

  // Reset HEAD
  store.head = null;

  // Archive a slim record
  const record: CommitRecord = {
    commitHash,
    committedAt: new Date().toISOString(),
    message: commitMessage,
    headCodename,
    purgedCodenames,
  };
  store.committed = [...(store.committed ?? []), record];

  // Delete the changes/ directory containing the specific diff hunks
  const changesDir = path.join(storeDir(rootDir), 'changes');
  if (fs.existsSync(changesDir)) {
    try {
      fs.rmSync(changesDir, { recursive: true, force: true });
    } catch {}
  }

  saveStore(rootDir, store);

  return { deleted: purgedCodenames, commitHash, archivedAs: record };
}

/** Get the latest git commit hash + message in rootDir (returns null if not a git repo) */
export function getLatestGitCommit(rootDir: string): { hash: string; message: string } | null {
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const hash = execSync('git rev-parse HEAD', { cwd: rootDir, stdio: 'pipe' })
      .toString().trim();
    const message = execSync('git log -1 --pretty=%s', { cwd: rootDir, stdio: 'pipe' })
      .toString().trim();
    return { hash, message };
  } catch {
    return null;
  }
}

/** Install a post-commit git hook that auto-purges checkpoints */
export function installGitHook(rootDir: string): string {
  const hookDir = path.join(rootDir, '.git', 'hooks');
  const hookPath = path.join(hookDir, 'post-commit');

  if (!fs.existsSync(hookDir)) {
    throw new Error(`No .git/hooks directory found in ${rootDir}. Is this a git repo?`);
  }

  const script = [
    '#!/bin/sh',
    '# Auto-generated by vela — removes local snapshots after commit',
    '# Remove this file to disable auto-purge on commit',
    `node "$(npm root -g 2>/dev/null)/vela/dist/cli.js" commit-purge . --hook 2>&1 | sed 's/^/[vela] /'`,
    `# fallback: try local node_modules`,
    `[ $? -ne 0 ] && node "$(pwd)/node_modules/vela/dist/cli.js" commit-purge . --hook 2>&1 | sed 's/^/[vela] /'`,
    'exit 0',
  ].join('\n') + '\n';

  fs.writeFileSync(hookPath, script, { mode: 0o755 });
  return hookPath;
}
