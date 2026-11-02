// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';

import { finishTransientWorktree, sweepTransientWorktrees } from '../diagnostics/transient-worktree-lifecycle.mjs';
import { withResourceGate } from '../lib/resource-gate.mjs';
import { resolveDesktopAppRoot, resolveDesktopLaunchTarget } from '../desktop/playwright-desktop-launch-target.mjs';
import { runQaWorkspaceCommand, startQaWorkspace } from './qa-workspace.mjs';
import { QA_BRANCH, qaGit, qaRecordPath, qaWorkspaceEnvironment, readQaWorkspace,
  verifyMountedQaVolume } from './qa-workspace-state.mjs';

const roots = [];
function fixture() {
  const artifacts = path.resolve('.tmp/artifacts/T682/fixtures');
  mkdirSync(artifacts, { recursive: true });
  const root = realpathSync(mkdtempSync(path.join(artifacts, 'qa-')));
  roots.push(root);
  const repoRoot = path.join(root, 'dev');
  const volumeRoot = path.join(root, 'volume');
  mkdirSync(volumeRoot);
  execFileSync('git', ['init', '-b', 'dev', repoRoot], { stdio: 'pipe' });
  qaGit(repoRoot, 'config', 'user.email', 'test@example.com');
  qaGit(repoRoot, 'config', 'user.name', 'Test');
  qaGit(repoRoot, 'config', 'core.fsmonitor', 'false');
  writeFileSync(path.join(repoRoot, 'base.txt'), 'base\n');
  writeFileSync(path.join(repoRoot, '.gitignore'), '.tmp/\n.cache/\n.lab/\nnode_modules/\nAGENTS.local.md\n');
  qaGit(repoRoot, 'add', '.');
  qaGit(repoRoot, 'commit', '-m', 'base');
  return { repoRoot, volumeRoot, worktreePath: path.join(volumeRoot, 'qa'), owner: 'test-chat',
    verifyVolume: directory => directory };
}
function commit(cwd, file, contents) {
  writeFileSync(path.join(cwd, file), contents);
  qaGit(cwd, 'add', file);
  qaGit(cwd, 'commit', '-m', file);
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('holds one committed snapshot while dev moves, preserving dirty development files', () => {
  const options = fixture();
  writeFileSync(path.join(options.repoRoot, 'dirty.txt'), 'keep');
  const state = startQaWorkspace(options);
  commit(options.repoRoot, 'development.txt', 'new development');
  expect(() => startQaWorkspace(options)).toThrow(/occupied/u);
  expect(readQaWorkspace(options.repoRoot).base).toBe(state.base);
  expect(qaGit(options.worktreePath, 'rev-parse', 'HEAD')).toBe(state.base);
  expect(existsSync(path.join(options.worktreePath, 'dirty.txt'))).toBe(false);
  expect(readFileSync(path.join(options.repoRoot, 'dirty.txt'), 'utf8')).toBe('keep');
  expect(qaGit(options.repoRoot, 'branch', '--show-current')).toBe('dev');
});

it('keeps active QA even when its entire HEAD is already in dev and maintenance sweeps', () => {
  const options = fixture();
  startQaWorkspace(options);
  expect(() => finishTransientWorktree({ repoRoot: options.repoRoot,
    worktreePath: options.worktreePath })).toThrow(/retained/u);
  const result = sweepTransientWorktrees({ repoRoot: options.repoRoot, days: 0 });
  expect(result).toMatchObject({ ok: true, removed: [] });
  expect(readQaWorkspace(options.repoRoot).phase).toBe('prepared');
});

it('preserves unmerged repair commits even when an explicit release is attempted', () => {
  const options = fixture();
  startQaWorkspace(options);
  commit(options.worktreePath, 'repair.txt', 'repair');
  expect(() => finishTransientWorktree({ repoRoot: options.repoRoot,
    worktreePath: options.worktreePath, releaseRetention: true })).toThrow(/not reachable/u);
  expect(readQaWorkspace(options.repoRoot).head).toBe(qaGit(options.worktreePath, 'rev-parse', 'HEAD'));
});

it('retains the owning chat and claim across a missing external workspace', () => {
  const options = fixture();
  const state = startQaWorkspace(options);
  const moved = `${options.worktreePath}-offline`;
  renameSync(options.worktreePath, moved);
  expect(readQaWorkspace(options.repoRoot)).toMatchObject({ phase: 'unavailable', owner: 'test-chat', base: state.base });
  expect(() => startQaWorkspace(options)).toThrow(/occupied/u);
  renameSync(moved, options.worktreePath);
  expect(readQaWorkspace(options.repoRoot).phase).toBe('prepared');
});

it('refuses an unmounted directory, a missing volume, or an occupied target without claiming QA', () => {
  const options = fixture();
  expect(() => verifyMountedQaVolume(options.volumeRoot)).toThrow(/not a mounted/u);
  expect(() => verifyMountedQaVolume(`${options.volumeRoot}-missing`)).toThrow();
  mkdirSync(options.worktreePath);
  expect(() => startQaWorkspace(options)).toThrow(/new directory/u);
  expect(readQaWorkspace(options.repoRoot).phase).toBe('idle');
});

it('does not overwrite an existing QA branch or leave a false preparation claim', () => {
  const options = fixture();
  qaGit(options.repoRoot, 'branch', QA_BRANCH);
  expect(() => startQaWorkspace(options)).toThrow();
  expect(existsSync(qaRecordPath(options.repoRoot))).toBe(false);
  expect(qaGit(options.repoRoot, 'branch', '--list', QA_BRANCH)).toContain(QA_BRANCH);
});

it('keeps mutable paths private and rejects a development-cache symlink', () => {
  const options = fixture();
  const state = startQaWorkspace(options);
  const env = qaWorkspaceEnvironment(state, { npm_config_cache: '/shared-download-cache' });
  expect(env.npm_config_cache).toBe('/shared-download-cache');
  expect(env.GRADLE_USER_HOME).toBe(path.join(options.worktreePath, '.cache/gradle'));
  expect(env.FOLIOLE_RESOURCE_GATE_RUNTIME_DIR).toBe(path.join(options.repoRoot, '.lab/internal/runtime'));
  rmSync(path.join(options.worktreePath, '.cache'), { recursive: true });
  symlinkSync(options.repoRoot, path.join(options.worktreePath, '.cache'), 'dir');
  expect(() => qaWorkspaceEnvironment(state)).toThrow(/must be private/u);
});

it('does not inherit the development application, database or installed runtime', () => {
  const options = fixture();
  const record = startQaWorkspace(options);
  const env = qaWorkspaceEnvironment(record, {
    FOLIOLE_ELECTRON_APP_ROOT: options.repoRoot,
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: options.repoRoot,
    FOLIOLE_MAIN_DATABASE_PATH: path.join(options.repoRoot, 'daily.db'),
    FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: '/installed/Foliole',
    FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed'
  });
  const appRoot = resolveDesktopAppRoot(env);
  const target = resolveDesktopLaunchTarget(appRoot, () => true, env);
  expect(appRoot).toBe(options.worktreePath);
  expect(target.mainEntry).toBe(path.join(options.worktreePath, 'dist/electron/main.js'));
  expect(target.launchMode).not.toBe('installed');
  expect(env.FOLIOLE_MAIN_DATABASE_PATH).toBe(path.join(options.worktreePath, '.tmp/qa-state/foliole.db'));
});

it('actually waits for the dev resource gate and runs in QA with its lock held', async () => {
  const options = fixture();
  vi.stubEnv('FOLIOLE_RESOURCE_GATE_HELD', '');
  vi.stubEnv('FOLIOLE_RESOURCE_GATE_RUNTIME_DIR', path.join(options.repoRoot, '.lab/internal/runtime'));
  startQaWorkspace(options);
  const resultFile = path.join(options.worktreePath, '.tmp', 'command.json');
  const command = [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(resultFile)},
    JSON.stringify({ cwd: process.cwd(), held: process.env.FOLIOLE_RESOURCE_GATE_HELD,
      tmp: process.env.TMPDIR, gradle: process.env.GRADLE_USER_HOME }))`];
  let pending;
  await withResourceGate({ className: 'node-heavy', repoRoot: options.repoRoot,
    commandLabel: 'dev-fixture', fn: async () => {
    pending = runQaWorkspaceCommand({ repoRoot: options.repoRoot, command,
      env: { ...process.env, FOLIOLE_RESOURCE_GATE_POLL_MS: '10' } });
    await delay(100);
    expect(existsSync(resultFile)).toBe(false);
  } });
  expect(await pending).toBe(0);
  expect(JSON.parse(readFileSync(resultFile, 'utf8'))).toMatchObject({
    cwd: options.worktreePath, held: 'node-heavy', tmp: path.join(options.worktreePath, '.tmp/system')
  });
});
