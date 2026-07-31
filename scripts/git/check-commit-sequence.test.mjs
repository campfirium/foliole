// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

function checkPush(repoDir, localRef, localSha, remoteRef, remoteSha) {
  const input = `${localRef} ${localSha} ${remoteRef} ${remoteSha}\n`;
  return spawnSync('node', [SCRIPT_PATH, 'pre-push'], { cwd: repoDir, encoding: 'utf8', input });
}

function commit(repoDir, subject) {
  git(repoDir, 'commit', '--allow-empty', '-m', subject);
  return git(repoDir, 'rev-parse', 'HEAD');
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
  const input = `refs/heads/release ${head} refs/heads/release ${'0'.repeat(40)}\n`;
  const result = spawnSync('node', [SCRIPT_PATH, 'pre-push'], { cwd: repoDir, encoding: 'utf8', input });

  expect(result.status, result.stderr).toBe(0);
});

it('supports a release-first branch through repeated numbered merge-backs', async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-release-first-'));
  tempDirs.push(repoDir);
  git(repoDir, 'init', '-b', 'dev');
  git(repoDir, 'config', 'user.name', 'Sequence Test');
  git(repoDir, 'config', 'user.email', 'sequence@example.com');
  const zeroSha = '0'.repeat(40);
  const seed = commit(repoDir, '000001 seed');
  git(repoDir, 'update-ref', 'refs/remotes/origin/dev', seed);
  expect(checkPush(repoDir, 'refs/heads/release', seed, 'refs/heads/release', zeroSha).status).toBe(0);

  git(repoDir, 'branch', 'release', seed);
  git(repoDir, 'update-ref', 'refs/remotes/origin/release', seed);
  git(repoDir, 'switch', 'release');
  const releaseFixOne = commit(repoDir, '000002 fix release candidate');
  expect(checkPush(
    repoDir,
    'refs/heads/release',
    releaseFixOne,
    'refs/heads/release',
    seed
  ).status).toBe(0);
  git(repoDir, 'update-ref', 'refs/remotes/origin/release', releaseFixOne);

  git(repoDir, 'switch', 'dev');
  const devWork = commit(repoDir, '000002 continue development');
  const messagePath = path.join(repoDir, 'merge-message.txt');
  await writeFile(messagePath, "Merge branch 'release' into dev\n", 'utf8');
  const unnumbered = spawnSync('node', [SCRIPT_PATH, 'commit-msg', messagePath], {
    cwd: repoDir,
    encoding: 'utf8'
  });
  expect(unnumbered.status).not.toBe(0);
  expect(unnumbered.stderr).toContain('next sequence 000003');
  git(repoDir, 'merge', '--no-ff', 'release', '-m', '000003 merge release fixes');
  const firstMerge = git(repoDir, 'rev-parse', 'HEAD');
  expect(checkPush(repoDir, 'refs/heads/dev', firstMerge, 'refs/heads/dev', seed).status).toBe(0);
  git(repoDir, 'update-ref', 'refs/remotes/origin/dev', firstMerge);

  git(repoDir, 'switch', 'release');
  const releaseFixTwo = commit(repoDir, '000003 fix release candidate again');
  expect(checkPush(
    repoDir,
    'refs/heads/release',
    releaseFixTwo,
    'refs/heads/release',
    releaseFixOne
  ).status).toBe(0);
  expect(spawnSync('git', ['merge-base', '--is-ancestor', devWork, releaseFixTwo], { cwd: repoDir }).status).not.toBe(0);

  git(repoDir, 'switch', 'dev');
  git(repoDir, 'merge', '--no-ff', 'release', '-m', '000004 merge later release fixes');
  const finalDev = git(repoDir, 'rev-parse', 'HEAD');
  expect(checkPush(repoDir, 'refs/heads/dev', finalDev, 'refs/heads/dev', firstMerge).status).toBe(0);
  expect(spawnSync('git', ['merge-base', '--is-ancestor', releaseFixTwo, finalDev], { cwd: repoDir }).status).toBe(0);
  expect(git(repoDir, 'log', '--first-parent', '--pretty=%s', 'dev').split('\n')).toEqual([
    '000004 merge later release fixes',
    '000003 merge release fixes',
    '000002 continue development',
    '000001 seed'
  ]);
});
