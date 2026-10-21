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

it('checks only release commits after the pushed dev base', async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-sequence-'));
  tempDirs.push(repoDir);
  git(repoDir, 'init');
  git(repoDir, 'config', 'user.name', 'Sequence Test');
  git(repoDir, 'config', 'user.email', 'sequence@example.com');
  commit(repoDir, '000001 seed');
  commit(repoDir, 'deps-dev(deps-dev): update dependencies');
  git(repoDir, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
  const release = commit(repoDir, '000002 start release');

  const result = checkPush(
    repoDir,
    'refs/heads/release',
    release,
    'refs/heads/release',
    '0'.repeat(40)
  );

  expect(result.status, result.stderr).toBe(0);
});

function checkMessage(repoDir, messagePath) {
  return spawnSync('node', [SCRIPT_PATH, 'commit-msg', messagePath], { cwd: repoDir, encoding: 'utf8' });
}

async function createReleaseRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-release-first-'));
  tempDirs.push(repoDir);
  git(repoDir, 'init', '-b', 'dev');
  git(repoDir, 'config', 'user.name', 'Sequence Test');
  git(repoDir, 'config', 'user.email', 'sequence@example.com');
  const seed = commit(repoDir, '000001 seed');
  git(repoDir, 'update-ref', 'refs/remotes/origin/dev', seed);
  git(repoDir, 'branch', 'release', seed);
  git(repoDir, 'switch', 'release');
  const releaseFix = commit(repoDir, '000002 fix release candidate');
  expect(checkPush(repoDir, 'refs/heads/release', releaseFix, 'refs/heads/release', '0'.repeat(40)).status).toBe(0);
  git(repoDir, 'update-ref', 'refs/remotes/origin/release', releaseFix);
  git(repoDir, 'switch', 'dev');
  return { repoDir, seed };
}

it('rejects dev commits that reuse a sequence already taken by the release branch', async () => {
  const { repoDir, seed } = await createReleaseRepo();
  const messagePath = path.join(repoDir, 'message.txt');
  await writeFile(messagePath, '000002 continue development\n', 'utf8');

  const message = checkMessage(repoDir, messagePath);
  expect(message.status).not.toBe(0);
  expect(message.stderr).toContain('next sequence 000003');

  const duplicate = commit(repoDir, '000002 continue development');
  const push = checkPush(repoDir, 'refs/heads/dev', duplicate, 'refs/heads/dev', seed);
  expect(push.status).not.toBe(0);
  expect(push.stderr).toContain('duplicate sequence 000002');
});

it('numbers release and dev work as one continuous history through merge-backs', { meta: { calibratedMs: 15_000 } }, async () => {
  const { repoDir, seed } = await createReleaseRepo();
  const devWork = commit(repoDir, '000003 continue development');
  const messagePath = path.join(repoDir, 'merge-message.txt');
  await writeFile(messagePath, "Merge branch 'release' into dev\n", 'utf8');
  const unnumbered = checkMessage(repoDir, messagePath);
  expect(unnumbered.status).not.toBe(0);
  expect(unnumbered.stderr).toContain('next sequence 000004');
  git(repoDir, 'merge', '--no-ff', 'release', '-m', '000004 merge release fixes');
  const firstMerge = git(repoDir, 'rev-parse', 'HEAD');
  expect(checkPush(repoDir, 'refs/heads/dev', firstMerge, 'refs/heads/dev', seed).status).toBe(0);
  git(repoDir, 'update-ref', 'refs/remotes/origin/dev', firstMerge);

  git(repoDir, 'switch', 'release');
  const releaseFixTwo = commit(repoDir, '000005 fix release candidate again');
  const releaseBase = git(repoDir, 'rev-parse', 'refs/remotes/origin/release');
  expect(checkPush(repoDir, 'refs/heads/release', releaseFixTwo, 'refs/heads/release', releaseBase).status).toBe(0);
  git(repoDir, 'update-ref', 'refs/remotes/origin/release', releaseFixTwo);
  expect(spawnSync('git', ['merge-base', '--is-ancestor', devWork, releaseFixTwo], { cwd: repoDir }).status).not.toBe(0);

  git(repoDir, 'switch', 'dev');
  git(repoDir, 'merge', '--no-ff', 'release', '-m', '000006 merge later release fixes');
  const finalDev = git(repoDir, 'rev-parse', 'HEAD');
  expect(checkPush(repoDir, 'refs/heads/dev', finalDev, 'refs/heads/dev', firstMerge).status).toBe(0);
  const numbers = git(repoDir, 'log', '--pretty=%s', 'dev').split('\n').map((subject) => subject.slice(0, 6));
  expect(numbers.sort()).toEqual(['000001', '000002', '000003', '000004', '000005', '000006']);
  const next = spawnSync('node', [SCRIPT_PATH, 'next'], { cwd: repoDir, encoding: 'utf8' });
  expect(next.stdout.trim()).toBe('000007');
});
