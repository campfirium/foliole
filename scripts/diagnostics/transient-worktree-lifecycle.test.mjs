import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createTransientWorktree,
  finishTransientWorktree,
  registerTransientWorktree,
  sweepTransientWorktrees
} from './transient-worktree-lifecycle.mjs';
import {
  canonicalWorktreePath,
  pathsReferToSameLocation
} from './transient-worktree-path-identity.mjs';

const roots = [];
const DAY_MS = 24 * 60 * 60 * 1000;

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'foliole-worktree-lifecycle-'));
  roots.push(root);
  const repo = join(root, 'repo');
  execFileSync('git', ['init', '--initial-branch=dev', repo]);
  git(repo, 'config', 'core.fsmonitor', 'false');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), 'base\n');
  writeFileSync(join(repo, '.gitignore'), 'cache/\n');
  git(repo, 'add', 'README.md', '.gitignore');
  git(repo, 'commit', '-m', 'base');
  return { repo, root };
}

function addAcceptance(repo, root, name = 'acceptance', createdAt) {
  const path = join(root, name);
  git(repo, 'worktree', 'add', '--detach', path, 'HEAD');
  registerTransientWorktree({
    ...(createdAt ? { createdAt } : {}),
    kind: 'acceptance',
    repoRoot: repo,
    targetRef: 'dev',
    worktreePath: path
  });
  return path;
}

function removeRegisteredFixtureWorktrees(root) {
  const repo = join(root, 'repo');
  if (!existsSync(repo)) return;
  const worktrees = git(repo, 'worktree', 'list', '--porcelain', '-z')
    .split('\0')
    .filter((entry) => entry.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
  for (const worktree of worktrees.slice(1)) {
    git(repo, 'worktree', 'remove', '--force', '--force', worktree);
  }
  git(repo, 'worktree', 'prune');
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRegisteredFixtureWorktrees(root);
    rmSync(root, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  }
});

describe('transient worktree lifecycle', () => {
  it('keeps fixture repositories independent of host file-system monitors', () => {
    const { repo } = fixture();

    expect(git(repo, 'config', '--local', '--get', 'core.fsmonitor')).toBe('false');
  });

  it('matches Windows aliases and path casing through native identity', () => {
    const realpath = (path) => path.replace('RUNNER~1', 'runneradmin');
    expect(pathsReferToSameLocation(
      'C:\\Users\\RUNNER~1\\Temp\\worktree',
      'c:\\users\\runneradmin\\temp\\worktree',
      { platform: 'win32', realpath }
    )).toBe(true);
  });

  it('creates and registers acceptance and development worktrees in one action', () => {
    const { repo, root } = fixture();
    const acceptance = join(root, 'acceptance');
    const development = join(root, 'development');

    createTransientWorktree({
      kind: 'acceptance', repoRoot: repo, targetRef: 'dev', worktreePath: acceptance
    });
    createTransientWorktree({
      branch: 'codex/test-work', kind: 'development', repoRoot: repo,
      targetRef: 'dev', worktreePath: development
    });

    expect(git(acceptance, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(git(development, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('codex/test-work');
    expect(readFileSync(join(git(acceptance, 'rev-parse', '--absolute-git-dir'),
      'foliole-transient-worktree.json'), 'utf8')).toContain('"kind": "acceptance"');
    expect(readFileSync(join(git(development, 'rev-parse', '--absolute-git-dir'),
      'foliole-transient-worktree.json'), 'utf8')).toContain('"kind": "development"');
  });

  it('removes a completed detached acceptance worktree', () => {
    const { repo, root } = fixture();
    const path = addAcceptance(repo, root);
    mkdirSync(join(path, 'cache'));
    writeFileSync(join(path, 'cache', 'output.bin'), 'ignored build output\n');

    finishTransientWorktree({ repoRoot: repo, worktreePath: path });

    expect(existsSync(path)).toBe(false);
    expect(git(repo, 'worktree', 'list', '--porcelain')).not.toContain(path);
  });

  it('keeps development work until its HEAD reaches the target branch', () => {
    const { repo, root } = fixture();
    const path = join(root, 'development');
    git(repo, 'worktree', 'add', '-b', 'codex/test-work', path, 'dev');
    registerTransientWorktree({ kind: 'development', repoRoot: repo, targetRef: 'dev', worktreePath: path });
    writeFileSync(join(path, 'feature.txt'), 'feature\n');
    git(path, 'add', 'feature.txt');
    git(path, 'commit', '-m', 'feature');

    expect(() => finishTransientWorktree({ repoRoot: repo, worktreePath: path }))
      .toThrow(/not reachable/u);
    git(repo, 'merge', '--ff-only', 'codex/test-work');
    finishTransientWorktree({ repoRoot: repo, worktreePath: path });

    expect(existsSync(path)).toBe(false);
    expect(git(repo, 'branch', '--list', 'codex/test-work')).toBe('');
  });

  it('refuses to remove a dirty worktree', () => {
    const { repo, root } = fixture();
    const path = addAcceptance(repo, root);
    writeFileSync(join(path, 'README.md'), 'changed\n');

    expect(() => finishTransientWorktree({ repoRoot: repo, worktreePath: path }))
      .toThrow(/dirty/u);
    expect(existsSync(path)).toBe(true);
  });

  it('unlocks and sweeps only expired registered worktrees', () => {
    const { repo, root } = fixture();
    const expired = addAcceptance(repo, root, 'expired', '2026-08-01T00:00:00.000Z');
    const recent = addAcceptance(repo, root, 'recent', '2026-08-09T00:00:00.000Z');
    const expiredCanonical = canonicalWorktreePath(expired);
    git(repo, 'worktree', 'lock', '--reason', 'test', expired);
    const lock = join(git(expired, 'rev-parse', '--absolute-git-dir'), 'locked');
    const oldLockTime = new Date('2026-08-01T00:00:00.000Z');
    utimesSync(lock, oldLockTime, oldLockTime);

    const result = sweepTransientWorktrees({
      days: 7,
      nowMs: Date.parse('2026-08-10T00:00:00.000Z'),
      repoRoot: repo
    });

    expect(result).toMatchObject({
      failures: [], ok: true, removed: [expiredCanonical]
    });
    expect(existsSync(expired)).toBe(false);
    expect(existsSync(recent)).toBe(true);
  });

  it('preserves a freshly locked active worktree and removes it after the lock expires', () => {
    const { repo, root } = fixture();
    const path = addAcceptance(repo, root, 'active', '2026-08-01T00:00:00.000Z');
    const canonicalPath = canonicalWorktreePath(path);
    git(repo, 'worktree', 'lock', '--reason', 'active owner', path);
    const lockedPath = join(git(path, 'rev-parse', '--absolute-git-dir'), 'locked');
    const nowMs = Date.parse('2026-08-10T00:00:00.000Z');
    const activeTime = new Date(nowMs - DAY_MS);
    utimesSync(lockedPath, activeTime, activeTime);

    expect(sweepTransientWorktrees({ days: 7, nowMs, repoRoot: repo }).removed).toEqual([]);
    const expiredTime = new Date(nowMs - 8 * DAY_MS);
    utimesSync(lockedPath, expiredTime, expiredTime);
    expect(sweepTransientWorktrees({ days: 7, nowMs, repoRoot: repo }).removed)
      .toEqual([canonicalPath]);
  });

  it('ignores worktrees that were never registered as transient', () => {
    const { repo, root } = fixture();
    const path = join(root, 'persistent');
    git(repo, 'worktree', 'add', '--detach', path, 'HEAD');

    const result = sweepTransientWorktrees({ days: 0, repoRoot: repo });

    expect(result).toMatchObject({ failures: [], ok: true, removed: [] });
    expect(existsSync(path)).toBe(true);
  });

  it('fails closed when a transient marker is damaged', () => {
    const { repo, root } = fixture();
    const path = addAcceptance(repo, root, 'damaged', '2026-08-01T00:00:00.000Z');
    const gitDirectory = git(path, 'rev-parse', '--absolute-git-dir');
    writeFileSync(join(gitDirectory, 'foliole-transient-worktree.json'), '{}\n');

    const result = sweepTransientWorktrees({
      days: 7,
      nowMs: Date.parse('2026-08-10T00:00:00.000Z'),
      repoRoot: repo
    });

    expect(result).toMatchObject({ ok: false, removed: [] });
    expect(result.failures[0].message).toMatch(/invalid transient marker/u);
    expect(existsSync(path)).toBe(true);
  });
});
