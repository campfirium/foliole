#!/usr/bin/env node
/* global console, process */

// Several agent sessions share one checkout and therefore one Git index. A plain
// `git commit` takes everything staged, including files another session staged but has
// not committed yet. When `foliole.pathScopedCommits` is enabled for the shared checkout,
// a commit must name its own files: either `git commit -- <paths>` (Git then builds a
// temporary index from those paths only), or `FOLIOLE_COMMIT_PATHS` declaring the paths
// that may appear in the staged set (for partial-hunk commits).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PATH_LIMITED_INDEX = /^next-index-.*\.lock$/u;
const SEQUENCER_HEADS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'];

function git(args, env) {
  const result = spawnSync('git', args, { encoding: 'utf8', env });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

export function parseDeclaredPaths(value) {
  return value
    .split(/[\n,]/u)
    .map((entry) => entry.trim().replace(/^\.\//u, '').replace(/\/+$/u, ''))
    .filter(Boolean);
}

export function findUndeclaredPaths(staged, declared) {
  return staged.filter(
    (file) => !declared.some((entry) => entry === '.' || file === entry || file.startsWith(`${entry}/`))
  );
}

export function evaluateStagedScope({ enabled, linkedWorktree, indexFile, sequencerActive, staged, env }) {
  if (!enabled || linkedWorktree || sequencerActive || staged.length === 0) {
    return { ok: true };
  }
  if (indexFile && PATH_LIMITED_INDEX.test(path.basename(indexFile))) {
    return { ok: true };
  }
  if (env.FOLIOLE_COMMIT_PATHS?.trim()) {
    const extras = findUndeclaredPaths(staged, parseDeclaredPaths(env.FOLIOLE_COMMIT_PATHS));
    return extras.length === 0 ? { ok: true } : { ok: false, reason: 'undeclared', extras };
  }
  if (env.FOLIOLE_COMMIT_WHOLE_INDEX === '1') {
    return { ok: true };
  }
  return { ok: false, reason: 'unscoped', extras: staged };
}

function formatFailure(result) {
  const list = result.extras.map((file) => `  ${file}`).join('\n');
  if (result.reason === 'undeclared') {
    return [
      'error: staged files outside FOLIOLE_COMMIT_PATHS (another session may have staged them):',
      list,
      '',
      'Commit only your own files: git commit -m "<message>" -- <your paths>',
    ].join('\n');
  }
  return [
    'error: this checkout is shared by several sessions; commit with explicit paths.',
    '',
    'The index currently stages:',
    list,
    '',
    'Use: git commit -m "<message>" -- <your paths>',
    'Partial hunks: FOLIOLE_COMMIT_PATHS="<path>,<path>" git commit ...',
    'Whole index on purpose: FOLIOLE_COMMIT_WHOLE_INDEX=1 git commit ...',
  ].join('\n');
}

function main() {
  const enabled = spawnSync('git', ['config', '--bool', 'foliole.pathScopedCommits'], { encoding: 'utf8' })
    .stdout.trim() === 'true';
  if (!enabled) {
    return 0;
  }
  const [gitDir, commonDir] = git(['rev-parse', '--absolute-git-dir', '--git-common-dir'])
    .trim()
    .split('\n');
  const linkedWorktree = path.resolve(gitDir) !== path.resolve(commonDir);
  const sequencerActive = SEQUENCER_HEADS.some((name) => existsSync(path.join(gitDir, name)));
  const staged = git(['diff', '--cached', '--name-only', '--no-renames', '-z'], process.env)
    .split('\0')
    .filter(Boolean);
  const result = evaluateStagedScope({
    enabled,
    linkedWorktree,
    indexFile: process.env.GIT_INDEX_FILE,
    sequencerActive,
    staged,
    env: process.env,
  });
  if (!result.ok) {
    console.error(formatFailure(result));
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
