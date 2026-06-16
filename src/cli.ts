#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { scanCodebase, readCodebase } from './index';
import { CodebaseWatcher } from './watcher';
import { listSessions, loadSession, snapshotFile } from './snapshot';
import { diffSession, renderDiff, diffSnapshots } from './diff';
import {
  initStore, loadStore, saveStore, createCheckpoint,
  resolveCheckpoint, restoreCheckpoint, getHistory,
  captureFile, generateCodename, makeId,
  purgeAfterCommit, getLatestGitCommit, installGitHook,
} from './store';
import { writeClaudeMd, generateRollbackPlan } from './ai-bridge';
import { walkDir } from './walker';

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

// ── Helpers ────────────────────────────────────────────────────────────────

function getRootDir(): string {
  return path.resolve(opt('root') ?? '.');
}

function color(code: string, text: string): string {
  return flag('no-color') ? text : `\x1b[${code}m${text}\x1b[0m`;
}

async function collectFiles(rootDir: string, extFilter?: string[]): Promise<string[]> {
  const files: string[] = [];
  for await (const f of walkDir(rootDir, { includeExtensions: extFilter })) {
    files.push(f);
  }
  return files;
}

// ── Commands ───────────────────────────────────────────────────────────────

/** vela init [dir] */
function cmdInit(targets?: string[]) {
  const rootDir = args[1] ? path.resolve(args[1]) : process.cwd();
  const store = initStore(rootDir, targets);
  writeClaudeMd(rootDir, store);
  console.log(color('32', '✓') + ` Initialized vela in ${rootDir}`);
  if (store.targets && store.targets.length > 0) {
    console.log(color('36', `  Targets: ${store.targets.join(', ')}`));
  }
  console.log(color('2', `  Store: ${rootDir}/.vela/store.json`));
  console.log(color('2', `  Manifest: ${rootDir}/CLAUDE.md`));
}

/** vela snap [dir] --intent="add dark mode" [--files=src/a.ts,src/b.ts] */
async function cmdSnap() {
  const rootDir = args[1] ? path.resolve(args[1]) : process.cwd();
  const intent = opt('intent') ?? opt('i') ?? 'unnamed change';
  const description = opt('desc') ?? opt('d') ?? intent;
  const tags = (opt('tags') ?? '').split(',').filter(Boolean);
  const fileArg = opt('files');

  const store = loadStore(rootDir);

  let filePaths: string[];
  if (fileArg) {
    filePaths = fileArg.split(',').map(f => path.resolve(rootDir, f.trim()));
  } else {
    const extArg = opt('ext');
    const exts = extArg ? extArg.split(',').map(e => e.startsWith('.') ? e : `.${e}`) : undefined;
    filePaths = await collectFiles(rootDir, exts);
  }

  const checkpoint = createCheckpoint(rootDir, store, { intent, description, filePaths, tags });
  writeClaudeMd(rootDir, store);

  console.log(color('32', '✓') + ` Checkpoint created`);
  console.log(`  ${color('36', 'Codename:')} ${color('1', checkpoint.codename)}`);
  console.log(`  ${color('2', 'ID:')}      ${checkpoint.id}`);
  console.log(`  ${color('2', 'Intent:')}  ${intent}`);
  console.log(`  ${color('2', 'Files:')}   ${Object.keys(checkpoint.files).length}`);
  console.log(`  ${color('2', 'Parent:')}  ${checkpoint.parent ?? 'none'}`);
}

/** vela log [dir] */
function cmdLog() {
  const rootDir = args[1] ? path.resolve(args[1]) : process.cwd();
  const store = loadStore(rootDir);
  const history = getHistory(store);

  if (history.length === 0) {
    console.log('No checkpoints yet. Run `vela snap` to create one.');
    return;
  }

  console.log(`\n${color('1', 'Checkpoint History')}  ${color('2', rootDir)}\n`);

  history.forEach((cp, i) => {
    const isHead = i === 0;
    const headLabel = isHead ? color('33', ' ← HEAD') : '';
    console.log(`${color('36', cp.codename)}${headLabel}`);
    console.log(`  ${color('2', cp.id)}  ${color('2', cp.createdAt.slice(0, 19).replace('T', ' '))}`);
    console.log(`  ${cp.intent}`);
    const fileList = Object.keys(cp.files).slice(0, 3).join(', ');
    const more = Object.keys(cp.files).length > 3 ? ` +${Object.keys(cp.files).length - 3} more` : '';
    console.log(`  ${color('2', fileList + more)}`);
    if (cp.tags.length) console.log(`  ${cp.tags.map(t => color('35', `#${t}`)).join(' ')}`);
    console.log('');
  });
}

/** vela restore <codename-or-id> [dir] */
function cmdRestore() {
  const ref = args[1];
  const rootDir = args[2] ? path.resolve(args[2]) : process.cwd();

  if (!ref) {
    console.error('Usage: vela restore <codename-or-id> [dir]');
    process.exit(1);
  }

  const store = loadStore(rootDir);
  const checkpoint = resolveCheckpoint(store, ref);

  if (!checkpoint) {
    console.error(`✗ No checkpoint matching "${ref}"`);
    console.error('Run `vela log` to see available codenames.');
    process.exit(1);
  }

  const plan = generateRollbackPlan(checkpoint, rootDir);

  if (plan.operations.length === 0) {
    console.log(color('32', '✓') + ' Already at this checkpoint — no changes needed.');
    return;
  }

  console.log(`\n${color('33', '⚡ Rolling back to')} ${color('1', checkpoint.codename)}`);
  console.log(`   Intent: ${checkpoint.intent}\n`);

  for (const op of plan.operations) {
    console.log(`  ${color('33', op.action === 'overwrite' ? 'OVERWRITE' : 'CREATE')} ${op.file}  ${color('2', `(${op.fromLines} → ${op.toLines} lines)`)}`);
  }

  if (!flag('dry-run')) {
    const restored = restoreCheckpoint(checkpoint, rootDir);

    // Snap the post-restore state as a new checkpoint so history stays linear
    const store2 = loadStore(rootDir);
    createCheckpoint(rootDir, store2, {
      intent: `rollback to: ${checkpoint.intent}`,
      description: `Rolled back to checkpoint ${checkpoint.codename}`,
      filePaths: restored,
      tags: ['rollback'],
    });
    writeClaudeMd(rootDir, store2);

    console.log(`\n${color('32', '✓')} Restored ${restored.length} file(s)`);
    console.log(color('2', '  A new rollback checkpoint was created so you can undo this too.'));
  } else {
    console.log(color('2', '\n[dry-run] No files written.'));
  }
}

/** vela plan <codename-or-id> [dir] — emit rollback plan JSON for AI agents */
function cmdPlan() {
  const ref = args[1];
  const rootDir = args[2] ? path.resolve(args[2]) : process.cwd();

  if (!ref) { console.error('Usage: vela plan <codename-or-id> [dir]'); process.exit(1); }

  const store = loadStore(rootDir);
  const checkpoint = resolveCheckpoint(store, ref);
  if (!checkpoint) { console.error(`No checkpoint matching "${ref}"`); process.exit(1); }

  const plan = generateRollbackPlan(checkpoint, rootDir);
  console.log(JSON.stringify(plan, null, 2));
}

/** vela watch [dir] — live watch + auto-snap on each save */
async function cmdWatch() {
  const rootDir = args[1] ? path.resolve(args[1]) : process.cwd();
  const intent = opt('intent') ?? 'live session';
  const storageDir = path.join(rootDir, '.vela', 'sessions');

  const store = initStore(rootDir);

  const { CodebaseWatcher } = await import('./watcher');
  const watcher = new CodebaseWatcher(rootDir, {
    storageDir,
    label: intent,
    onChange: async (filePath, type) => {
      if (type === 'change') {
        // Auto-snap changed file
        const s = loadStore(rootDir);
        createCheckpoint(rootDir, s, {
          intent: `auto: ${intent}`,
          description: `Auto-snapshot of ${path.relative(rootDir, filePath)}`,
          filePaths: [filePath],
          tags: ['auto', 'watch'],
        });
        writeClaudeMd(rootDir, loadStore(rootDir));
        const cp = loadStore(rootDir).checkpoints[loadStore(rootDir).checkpoints.length - 1];
        console.error(`  → snapped ${color('36', cp.codename)}`);
      }
    },
  });

  watcher.start();
  console.error(`${color('33', '👁  Watching')} ${rootDir}`);
  console.error(`${color('2', 'Every file save = new checkpoint. Ctrl+C to stop.')}\n`);

  process.on('SIGINT', async () => {
    await watcher.stop();
    console.error('\n' + color('32', '✓') + ' Watch session ended.');
    cmdLog();
    process.exit(0);
  });
}

// ── Router ─────────────────────────────────────────────────────────────────

/** vela commit-purge [dir] — purge all checkpoints, called after git commit */
function cmdCommitPurge() {
  const rootDir = args[1] && !args[1].startsWith('--') ? path.resolve(args[1]) : process.cwd();
  const isHook = flag('hook'); // called from git hook — quieter output

  const store = loadStore(rootDir);

  if (!store.head) {
    if (!isHook) console.log('No checkpoints to purge.');
    return;
  }

  const cycle = getHistory(store);
  if (cycle.length === 0) {
    if (!isHook) console.log('Nothing to purge.');
    return;
  }

  // Get git commit info
  const git = getLatestGitCommit(rootDir);
  if (!git) {
    console.error('✗ Could not read git commit. Are you in a git repo?');
    process.exit(1);
  }

  const result = purgeAfterCommit(rootDir, store, git.hash, git.message);
  writeClaudeMd(rootDir, loadStore(rootDir));

  if (isHook) {
    // Terse output for git hook
    console.log(`Purged ${result.deleted.length} checkpoint(s) after commit ${git.hash.slice(0, 7)}`);
    result.deleted.forEach(name => console.log(`  - ${name}`));
  } else {
    console.log(`\n${color('32', '✓')} Commit detected: ${color('2', git.hash.slice(0, 7))} ${git.message}`);
    console.log(`\n${color('33', 'Purged checkpoints:')}`);
    result.deleted.forEach(name => console.log(`  ${color('31', '✕')} ${name}`));
    console.log(`\n${color('2', 'Committed as:')} ${result.archivedAs.headCodename}`);
    console.log(color('2', 'Store is clean. Ready for the next feature cycle.\n'));
  }
}

/** vela hook [dir] — install git post-commit hook */
function cmdHook() {
  const rootDir = args[1] && !args[1].startsWith('--') ? path.resolve(args[1]) : process.cwd();
  try {
    const hookPath = installGitHook(rootDir);
    console.log(`${color('32', '✓')} Git post-commit hook installed`);
    console.log(color('2', `  ${hookPath}`));
    console.log(color('2', '  Snapshots will auto-purge on every `git commit`'));
    console.log(color('2', '  To disable: rm ' + hookPath));
  } catch (e: any) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}

/** vela show <codename-or-id> <file-path> [dir] */
function cmdShow() {
  const ref = args[1];
  const filePath = args[2];
  const rootDir = args[3] && !args[3].startsWith('--') ? path.resolve(args[3]) : process.cwd();

  if (!ref || !filePath) {
    console.error('Usage: vela show <codename-or-id> <file-path> [dir]');
    process.exit(1);
  }

  const store = loadStore(rootDir);
  const checkpoint = resolveCheckpoint(store, ref);
  if (!checkpoint) {
    console.error(`✗ No checkpoint matching "${ref}"`);
    process.exit(1);
  }

  const relPath = path.relative(rootDir, path.resolve(rootDir, filePath)).replace(/\\/g, '/');
  const fileState = checkpoint.files[relPath];

  if (!fileState) {
    console.error(`✗ File "${relPath}" not found in checkpoint "${checkpoint.codename}"`);
    console.error('Available files:');
    Object.keys(checkpoint.files).forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }

  console.log(`\n${color('36', 'File:')} ${relPath} (${color('2', `Checkpoint: ${checkpoint.codename}`)})\n`);
  const lines = fileState.content.split('\n');
  lines.forEach((line, i) => {
    console.log(`${color('2', String(i + 1).padStart(4) + ' |')} ${line}`);
  });
}

/** vela diff <codename-or-id> [file-path] [dir] */
function cmdDiff() {
  const ref = args[1];
  const filePath = args[2] && !args[2].startsWith('--') ? args[2] : undefined;
  // If filePath was parsed, rootDir is args[3], else args[2] if it's a directory
  let rootDir = process.cwd();
  if (filePath) {
    rootDir = args[3] && !args[3].startsWith('--') ? path.resolve(args[3]) : process.cwd();
  } else {
    rootDir = args[2] && !args[2].startsWith('--') ? path.resolve(args[2]) : process.cwd();
  }

  if (!ref) {
    console.error('Usage: vela diff <codename-or-id> [file-path] [dir]');
    process.exit(1);
  }

  const store = loadStore(rootDir);
  const checkpoint = resolveCheckpoint(store, ref);
  if (!checkpoint) {
    console.error(`✗ No checkpoint matching "${ref}"`);
    process.exit(1);
  }

  const filesToDiff = filePath
    ? [path.relative(rootDir, path.resolve(rootDir, filePath)).replace(/\\/g, '/')]
    : Object.keys(checkpoint.files);

  const sessionDiff = {
    sessionId: checkpoint.id,
    label: `Diff against local files`,
    startedAt: checkpoint.createdAt,
    endedAt: 'local disk',
    files: [] as any[],
    totalAdded: 0,
    totalRemoved: 0,
    totalFilesChanged: 0,
  };

  for (const relPath of filesToDiff) {
    const fileState = checkpoint.files[relPath];
    const fullPath = path.join(rootDir, relPath);

    const beforeSnap = fileState ? {
      file: fullPath,
      capturedAt: checkpoint.createdAt,
      hash: fileState.hash,
      lines: fileState.content.split('\n'),
    } : null;

    const afterSnap = snapshotFile(fullPath);

    const fd = diffSnapshots(beforeSnap, afterSnap, fullPath);
    if (fd.changeType !== 'unchanged') {
      sessionDiff.files.push(fd);
      sessionDiff.totalAdded += fd.linesAdded;
      sessionDiff.totalRemoved += fd.linesRemoved;
      sessionDiff.totalFilesChanged++;
    }
  }

  if (sessionDiff.files.length === 0) {
    console.log(color('32', '✓') + ' All files match local disk.');
    return;
  }

  console.log(renderDiff(sessionDiff, { color: !flag('no-color') }));
}

switch (command) {
  case 'init':         cmdInit(); break;
  case 'claude':       cmdInit(['claude']); break;
  case 'cursor':       cmdInit(['cursor']); break;
  case 'copilot':      cmdInit(['copilot']); break;
  case 'windsurf':     cmdInit(['windsurf']); break;
  case 'agy':          cmdInit(['agy']); break;
  case 'codex':        cmdInit(['codex']); break;
  case 'snap':         cmdSnap().catch(e => { console.error(e.message); process.exit(1); }); break;
  case 'log':          cmdLog(); break;
  case 'show':         cmdShow(); break;
  case 'diff':         cmdDiff(); break;
  case 'restore':      cmdRestore(); break;
  case 'plan':         cmdPlan(); break;
  case 'watch':        cmdWatch().catch(e => { console.error(e.message); process.exit(1); }); break;
  case 'commit-purge': cmdCommitPurge(); break;
  case 'hook':         cmdHook(); break;
  case 'scan':
    (async () => {
      const rootDir = args[1] ?? '.';
      const stats = await scanCodebase(rootDir, {
        onFileEnd: ({ file, totalLines }) => console.log(`  ${file}  (${totalLines} lines)`),
      });
      console.log(`\n${stats.totalFiles} files, ${stats.totalLines} lines, ${stats.durationMs}ms`);
    })().catch(e => { console.error(e.message); process.exit(1); });
    break;
  default:
    console.log(`
${color('1', 'vela')} — AI-readable snapshot & rollback for your codebase

${color('33', 'Commands:')}
  init          [dir]               Set up tracking in a project (all tools)
  claude        [dir]               Set up tracking targeted for Claude Code
  cursor        [dir]               Set up tracking targeted for Cursor
  copilot       [dir]               Set up tracking targeted for GitHub Copilot
  windsurf      [dir]               Set up tracking targeted for Windsurf
  agy           [dir]               Set up tracking targeted for Antigravity
  codex         [dir]               Set up tracking targeted for Codex
  snap          [dir]               Snapshot current state
                  --intent="add dark mode"
                  --files=src/a.ts,src/b.ts
                  --tags=auth,ui
  log           [dir]               List all checkpoints with codenames
  show     <codename> <file> [dir]  Show exact file contents in a checkpoint
  diff     <codename> [file] [dir]  Diff checkpoint files against local disk
  restore  <codename> [dir]         Roll files back to a checkpoint
                  --dry-run
  plan     <codename> [dir]         Emit rollback plan JSON (for AI agents)
  watch         [dir]               Auto-snap on every file save
  commit-purge  [dir]               Purge all snapshots after a git commit
  hook          [dir]               Install git post-commit hook (auto-purge)
  scan          [dir]               Read codebase line by line

${color('2', 'Codenames: "glacier-add-dark-mode-7f3a" — AI-readable, partial-match supported')}
${color('2', 'CLAUDE.md and rules files are kept in sync so your AI agent knows what to restore.')}

${color('33', 'Typical flow:')}
  vela claude && vela hook     # once per project
  vela snap --intent="baseline"
  # Claude Code adds feature 1
  vela snap --intent="add dark mode"
  # Claude Code adds feature 2
  vela snap --intent="add auth"
  vela diff dark-mode              # diff local workspace against checkpoint
  vela show dark-mode src/app.ts   # view checkpoint file content
  vela restore dark-mode            # roll back
  git commit -am "ship dark mode"          # → hook auto-purges all snaps
`);
}

