import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  finishTransientWorktree,
  registerTransientWorktree,
  sweepTransientWorktrees
} from './transient-worktree-lifecycle.mjs';

const roots = [];

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'foliole-worktree-lifecycle-'));
  roots.push(root);
  const repo = join(root, 'repo');
  execFileSync('git', ['init', '--initial-branch=dev', repo]);
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

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('transient worktree lifecycle', () => {
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
    git(repo, 'worktree', 'lock', '--reason', 'test', expired);

    const result = sweepTransientWorktrees({
      days: 7,
      nowMs: Date.parse('2026-08-10T00:00:00.000Z'),
      repoRoot: repo
    });

    expect(result).toMatchObject({ failures: [], ok: true, removed: [join(realpathSync(root), 'expired')] });
    expect(existsSync(expired)).toBe(false);
    expect(existsSync(recent)).toBe(true);
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
