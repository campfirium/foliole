// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { qaGit, qaRecordPath, readQaWorkspace } from './qa-workspace-state.mjs';
import { startQaWorkspace } from './qa-workspace.mjs';
import { integrateQaWorkspace, saveQaRecord } from './qa-workspace-integration.mjs';
import { finishQaWorkspace } from './qa-workspace-finish.mjs';
import { finishTransientWorktree } from '../diagnostics/transient-worktree-lifecycle.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const artifacts = path.resolve('.tmp/artifacts/T682/integration-fixtures');
  mkdirSync(artifacts, { recursive: true });
  const root = realpathSync(mkdtempSync(path.join(artifacts, 'qa-')));
  roots.push(root);
  const dev = path.join(root, 'dev');
  execFileSync('git', ['init', '-b', 'dev', dev], { stdio: 'pipe' });
  qaGit(dev, 'config', 'user.name', 'Test');
  qaGit(dev, 'config', 'user.email', 'test@example.com');
  qaGit(dev, 'config', 'core.fsmonitor', 'false');
  writeFileSync(path.join(dev, '.gitignore'), '.tmp/\n.cache/\n.lab/\nAGENTS.local.md\n');
  writeFileSync(path.join(dev, 'package.json'), '{"type":"module"}');
  cpSync('scripts/git', path.join(dev, 'scripts/git'), { recursive: true });
  cpSync('.githooks', path.join(dev, '.githooks'), { recursive: true });
  qaGit(dev, 'config', 'core.hooksPath', '.githooks');
  qaGit(dev, 'add', '.');
  qaGit(dev, 'commit', '-m', '000001 base');
  const state = startQaWorkspace({ repoRoot: dev, volumeRoot: root, worktreePath: path.join(root, 'qa'),
    owner: 'test-owner', verifyVolume: value => value });
  return { dev, qa: state.worktreePath, root, verifyRun: vi.fn(async () => {}), verifyVolume: value => value };
}
function commit(cwd, file, content) {
  writeFileSync(path.join(cwd, file), content);
  qaGit(cwd, 'add', file);
  const sequence = execFileSync('node', ['scripts/git/check-commit-sequence.mjs', 'next'], { cwd, encoding: 'utf8' }).trim();
  qaGit(cwd, 'commit', '-m', `${sequence} ${file}`);
  return qaGit(cwd, 'rev-parse', 'HEAD');
}
function green(f, tip, scope = 'full') {
  const record = readQaWorkspace(f.dev);
  record.run = { runId: 42, scope, passed: true, targetSha: tip };
  saveQaRecord(record);
}
const integrate = (f, validate) => integrateQaWorkspace({ repoRoot: f.dev, verifyRun: f.verifyRun, validate });

it('returns only a verified prefix, then the rest, with real hooks and independent dev progress', async () => {
  const f = fixture();
  const first = commit(f.qa, 'repair-one', 'first');
  const second = commit(f.qa, 'repair-two', 'second');
  commit(f.dev, 'new-feature', 'development');
  mkdirSync(path.join(f.root, 'cache'));
  symlinkSync(path.join(f.root, 'cache'), path.join(f.dev, '.cache'), 'dir');
  green(f, first, 'shared');
  await integrate(f, async cwd => {
    expect(readFileSync(path.join(cwd, 'repair-one'), 'utf8')).toBe('first');
    expect(existsSync(path.join(cwd, 'repair-two'))).toBe(false);
    expect(readFileSync(path.join(cwd, 'new-feature'), 'utf8')).toBe('development');
  });
  expect(qaGit(f.qa, 'rev-parse', 'HEAD')).toBe(second);
  green(f, second);
  await integrate(f, async cwd => expect(readFileSync(path.join(cwd, 'repair-two'), 'utf8')).toBe('second'));
  expect(qaGit(f.dev, 'log', '-1', '--format=%s')).toMatch(/^\d{6} integrate verified QA repairs$/u);
  expect(qaGit(f.dev, 'status', '--porcelain', '--untracked-files=no')).toBe('');
  expect(realpathSync(path.join(f.dev, '.cache'))).toBe(path.join(f.root, 'cache'));
  const finish = { repoRoot: f.dev, verifyRun: f.verifyRun, verifyVolume: f.verifyVolume, removeRemote: async () => {} };
  expect(await finishQaWorkspace(finish)).toEqual({ phase: 'idle' });
  expect(JSON.parse(readFileSync(path.join(f.dev, '.tmp/artifacts/qa/42/workspace.json'), 'utf8')).cleanupTip).toBe(second);
  expect(existsSync(f.qa)).toBe(false);
  const next = startQaWorkspace({ repoRoot: f.dev, volumeRoot: f.root, worktreePath: f.qa,
    owner: 'next-owner', verifyVolume: f.verifyVolume });
  expect(next.base).toBe(qaGit(f.dev, 'rev-parse', 'HEAD'));
});

it('refuses dirty dev without touching it and detects merge conflicts before starting a merge', async () => {
  const f = fixture();
  const tip = commit(f.qa, 'same-file', 'QA');
  green(f, tip);
  writeFileSync(path.join(f.dev, 'dirty'), 'keep');
  await expect(integrate(f, async () => {})).rejects.toThrow(/clean dev/u);
  expect(readFileSync(path.join(f.dev, 'dirty'), 'utf8')).toBe('keep');
  rmSync(path.join(f.dev, 'dirty'));
  commit(f.dev, 'same-file', 'dev');
  const before = qaGit(f.dev, 'rev-parse', 'HEAD');
  await expect(integrate(f, async () => {})).rejects.toThrow();
  expect(qaGit(f.dev, 'rev-parse', 'HEAD')).toBe(before);
  expect(qaGit(f.dev, 'status', '--porcelain')).toBe('');
});

it('aborts its own failed integration without committing an unverified merge', async () => {
  const f = fixture();
  green(f, commit(f.qa, 'repair', 'QA'));
  const before = qaGit(f.dev, 'rev-parse', 'HEAD');
  await expect(integrate(f, async () => { throw new Error('behavior failed'); })).rejects.toThrow(/behavior failed/u);
  expect(qaGit(f.dev, 'rev-parse', 'HEAD')).toBe(before);
  expect(qaGit(f.dev, 'status', '--porcelain')).toBe('');
});

it('keeps ownership after remote cleanup failure, resumes local cleanup failure, and then accepts another QA', async () => {
  const f = fixture();
  green(f, commit(f.qa, 'repair', 'QA'));
  await integrate(f, async () => {});
  const options = { repoRoot: f.dev, verifyRun: f.verifyRun, verifyVolume: f.verifyVolume };
  await expect(finishQaWorkspace({ ...options, removeRemote: async () => { throw new Error('remote offline'); } }))
    .rejects.toThrow(/remote offline/u);
  expect(readQaWorkspace(f.dev)).toMatchObject({ phase: 'finishing', owner: 'test-owner' });
  await expect(finishQaWorkspace({ ...options, removeRemote: async () => {},
    finishLocal: () => { throw new Error('local busy'); } })).rejects.toThrow(/local busy/u);
  expect(existsSync(qaRecordPath(f.dev))).toBe(true);
  await expect(finishQaWorkspace({ ...options, removeRemote: async () => {}, finishLocal: input => {
    finishTransientWorktree(input);
    throw new Error('interrupted after local removal');
  } })).rejects.toThrow(/interrupted/u);
  expect(readQaWorkspace(f.dev)).toMatchObject({ phase: 'finishing', available: false });
  await finishQaWorkspace({ ...options, removeRemote: async () => {} });
  expect(readQaWorkspace(f.dev).phase).toBe('idle');
});

it('preserves outside staged work if validation is interrupted during integration', async () => {
  const f = fixture();
  green(f, commit(f.qa, 'repair', 'QA'));
  await expect(integrate(f, async cwd => {
    writeFileSync(path.join(cwd, 'outside-work'), 'keep');
    qaGit(cwd, 'add', 'outside-work');
    throw new Error('validation interrupted');
  })).rejects.toThrow(/interrupted/u);
  expect(readFileSync(path.join(f.dev, 'outside-work'), 'utf8')).toBe('keep');
  expect(qaGit(f.dev, 'diff', '--cached', '--name-only')).toContain('outside-work');
});
