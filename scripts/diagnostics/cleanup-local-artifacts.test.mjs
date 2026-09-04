// @vitest-environment node

import { existsSync, lutimesSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CLEANUP_ROOTS, runCleanup } from './cleanup-local-artifacts.mjs';

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'cleanup-local-artifacts.mjs');
const repoRoot = resolve(dirname(scriptPath), '../..');
const nowMs = Date.UTC(2026, 5, 11);
const oldTime = new Date(nowMs - 8 * 24 * 60 * 60 * 1000);
const recentTime = new Date(nowMs - 2 * 24 * 60 * 60 * 1000);

function touch(path, time) {
  writeFileSync(path, 'x');
  utimesSync(path, time, time);
}

describe('cleanup-local-artifacts', () => {
  it('only collects expired entries from the local artifact whitelist', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-cleanup-test-'));
    try {
      for (const name of CLEANUP_ROOTS) {
        mkdirSync(join(root, name), { recursive: true });
      }
      mkdirSync(join(root, 'docs'));
      touch(join(root, '.tmp', 'old-cache'), oldTime);
      touch(join(root, '.tmp', 'recent-cache'), recentTime);
      mkdirSync(join(root, '.tmp/artifacts/old-batch'), { recursive: true });
      mkdirSync(join(root, '.tmp/artifacts/recent-batch'), { recursive: true });
      touch(join(root, '.tmp/artifacts/old-batch', 'evidence.zip'), oldTime);
      touch(join(root, '.tmp/artifacts/recent-batch', 'evidence.zip'), recentTime);
      utimesSync(join(root, '.tmp/artifacts/old-batch'), oldTime, oldTime);
      utimesSync(join(root, '.tmp/artifacts/recent-batch'), recentTime, recentTime);
      touch(join(root, 'release', 'old-installer.exe'), oldTime);
      touch(join(root, 'artifacts/windows', 'old-installer.exe'), oldTime);
      touch(join(root, 'artifacts/windows-internal', 'old-internal-installer.exe'), oldTime);
      touch(join(root, 'docs', 'old-doc.md'), oldTime);

      const result = runCleanup({ apply: false, days: 7, dryRun: true, nowMs, rootDir: root });

      expect(result.entries.map((entry) => entry.path)).toEqual([
        join(root, '.tmp', 'old-cache'),
        join(root, 'artifacts/windows-internal', 'old-internal-installer.exe'),
        join(root, 'artifacts/windows', 'old-installer.exe'),
        join(root, 'release', 'old-installer.exe')
      ]);
      expect(existsSync(join(root, '.tmp/artifacts', 'old-batch'))).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('deletes only collected candidates when applied', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-cleanup-apply-test-'));
    try {
      mkdirSync(join(root, '.tmp'), { recursive: true });
      mkdirSync(join(root, 'release'), { recursive: true });
      touch(join(root, '.tmp', 'old-cache'), oldTime);
      touch(join(root, '.tmp', 'recent-cache'), recentTime);
      touch(join(root, 'release', 'old-installer.exe'), oldTime);

      const result = runCleanup({ apply: true, days: 7, dryRun: false, nowMs, rootDir: root });

      expect(result.deletedCount).toBe(2);
      expect(existsSync(join(root, '.tmp', 'old-cache'))).toBe(false);
      expect(existsSync(join(root, '.tmp', 'recent-cache'))).toBe(true);
      expect(existsSync(join(root, 'release'))).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('collects broken symlinks without following them', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-cleanup-symlink-test-'));
    try {
      mkdirSync(join(root, '.tmp'), { recursive: true });
      symlinkSync('.tmp/missing.log', join(root, '.tmp', 'latest'));
      lutimesSync(join(root, '.tmp', 'latest'), oldTime, oldTime);

      const result = runCleanup({ apply: false, days: 7, dryRun: true, nowMs, rootDir: root });

      expect(result.entries.map((entry) => entry.path)).toEqual([join(root, '.tmp', 'latest')]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('protects Git worktrees from general cleanup', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-cleanup-worktree-test-'));
    try {
      const worktree = join(root, '.tmp', 'old-acceptance');
      mkdirSync(worktree, { recursive: true });
      touch(join(worktree, '.git'), oldTime);
      utimesSync(worktree, oldTime, oldTime);

      const result = runCleanup({ apply: true, days: 7, dryRun: false, nowMs, rootDir: root });

      expect(result.entries).toEqual([]);
      expect(existsSync(worktree)).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects arbitrary cleanup roots from the CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-cleanup-rejected-root-'));
    try {
      const result = spawnSync(process.execPath, [scriptPath, '--root', root, '--dry-run'], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--root must be');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('uses and accepts the repository root from the CLI', () => {
    const defaultResult = spawnSync(process.execPath, [scriptPath, '--days', '999999', '--dry-run'], { encoding: 'utf8' });
    const explicitResult = spawnSync(process.execPath, [scriptPath, '--root', repoRoot, '--days', '999999', '--dry-run'], { encoding: 'utf8' });

    expect(defaultResult.status).toBe(0);
    expect(defaultResult.stdout).toContain(`root=${repoRoot}`);
    expect(explicitResult.status).toBe(0);
    expect(explicitResult.stdout).toContain(`root=${repoRoot}`);
  });
});
