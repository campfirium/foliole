// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'vitest';

const SCRIPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-commit-sequence.mjs');
const tempDirs = [];

function git(repoDir, ...args) {
  const result = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

it('allows a new branch at an already-pushed commit', async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-sequence-'));
  tempDirs.push(repoDir);
  git(repoDir, 'init');
  git(repoDir, 'config', 'user.name', 'Sequence Test');
  git(repoDir, 'config', 'user.email', 'sequence@example.com');
  git(repoDir, 'commit', '--allow-empty', '-m', 'remote merge without local sequence');
  git(repoDir, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
  const head = git(repoDir, 'rev-parse', 'HEAD');
  const input = `refs/heads/release/1.0.0 ${head} refs/heads/release/1.0.0 ${'0'.repeat(40)}\n`;
  const result = spawnSync('node', [SCRIPT_PATH, 'pre-push'], { cwd: repoDir, encoding: 'utf8', input });

  expect(result.status, result.stderr).toBe(0);
});
