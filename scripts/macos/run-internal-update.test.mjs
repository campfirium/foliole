import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import {
  createInternalBuildSteps, resolveInternalPackagingDecision, runInternalUpdate,
  runInternalUpdateWithHandoff
} from './run-internal-update.mjs';

const REVISION = 'b'.repeat(40);

describe('Internal update fixed-input worker', () => {
  it.each(['current', 'older'])('forces only the current accounted revision: %s', async (target) => {
    const root = await mkdtemp(path.join(tmpdir(), 'foliole-force-update-'));
    try {
      const git = (...args) => {
        const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(0);
        return result.stdout.trim();
      };
      git('init');
      const commit = () => git('-c', 'user.name=Test', '-c', 'user.email=test@example.com',
        'commit', '--allow-empty', '-m', 'fixture');
      commit();
      const older = git('rev-parse', 'HEAD');
      commit();
      const current = git('rev-parse', 'HEAD');
      const revision = target === 'current' ? current : older;
      const stateRoot = path.join(root, 'state');
      await mkdir(stateRoot);
      await writeFile(path.join(stateRoot, 'accounted-revision'), current);
      const run = vi.fn((command, args, options) => args[0] === 'merge-base'
        ? spawnSync(command, args, options) : { status: 0 });
      const result = await runInternalUpdate({
        force: true, repositoryRoot: root, revision, stateRoot, run,
        pathExists: async () => false
      });
      expect(result.status).toBe(target === 'current' ? 'installed' : 'skipped');
      expect(run.mock.calls.some(([command]) => command === 'npm')).toBe(target === 'current');
      expect((await readFile(path.join(stateRoot, 'accounted-revision'), 'utf8')).trim()).toBe(current);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the default state directory when the CLI omits state-root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'foliole-update-cli-'));
    try {
      const git = (...args) => {
        const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(0);
        return result.stdout.trim();
      };
      git('init');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'fixture');
      const revision = git('rev-parse', 'HEAD');
      const stateRoot = path.join(root, '.tmp/macos/internal-update');
      await mkdir(stateRoot, { recursive: true });
      await writeFile(path.join(stateRoot, 'accounted-revision'), revision);
      const result = spawnSync(process.execPath, [
        path.resolve('scripts/macos/run-internal-update.mjs'), '--repository', root, '--revision', revision
      ], { cwd: root, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('skipped stale revision=');
      expect(await readFile(path.join(stateRoot, 'accounted-revision'), 'utf8')).toBe(revision);
      await expect(readFile(path.join(root, '--repository/accounted-revision'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('builds from an archived revision and an isolated APFS dependency clone', () => {
    const build = createInternalBuildSteps({
      includeCodexCache: true, repositoryRoot: '/repo', revision: REVISION, temporaryRoot: '/tmp/job'
    });
    expect(build.steps).toEqual([
      expect.objectContaining({ command: 'git', args: ['archive', '--format=tar', '--output=/tmp/job/source.tar', REVISION] }),
      expect.objectContaining({ command: 'tar', args: ['-xf', '/tmp/job/source.tar', '-C', '/tmp/job/source'] }),
      expect.objectContaining({ command: '/bin/cp', args: ['-cR', '/repo/node_modules', '/tmp/job/source/node_modules'] }),
      expect.objectContaining({ command: '/bin/mkdir', args: ['-p', '/tmp/job/source/.tmp'] }),
      expect.objectContaining({
        command: '/bin/cp',
        args: ['-cR', '/repo/.tmp/electron-mas-arm64', '/tmp/job/source/.tmp/electron-mas-arm64']
      }),
      expect.objectContaining({ command: '/bin/mkdir', args: ['-p', '/tmp/job/source/.tmp/macos'] }),
      expect.objectContaining({ command: '/bin/cp', args: ['-cR', '/repo/.tmp/macos/codex', '/tmp/job/source/.tmp/macos/codex'] }),
      expect.objectContaining({ command: 'npm', args: ['run', 'macos:internal:update'], cwd: '/tmp/job/source' })
    ]);
  });

  it('skips only when every changed path is explicitly irrelevant', () => {
    expect(resolveInternalPackagingDecision(['docs/guide.md', 'scripts/check-structure-boundary.mjs'])).toBe('skip');
    expect(resolveInternalPackagingDecision(['docs/guide.md', 'scripts/macos/package-mas.mjs'])).toBe('build');
    expect(resolveInternalPackagingDecision([])).toBe('skip');
  });

  it('advances the baseline without building for irrelevant changes', async () => {
    const run = vi.fn();
    const writeBaseline = vi.fn();
    await expect(runInternalUpdate({
      baseline: 'a'.repeat(40), inspection: { changedFiles: ['docs/guide.md'], stale: false },
      repositoryRoot: '/repo', revision: REVISION, run, stateRoot: '/state',
      writeBaseline, makeDirectory: vi.fn()
    })).resolves.toEqual({ revision: REVISION, status: 'skipped' });
    expect(run).not.toHaveBeenCalled();
    expect(writeBaseline).toHaveBeenCalledWith('/state', REVISION);
  });

  it('builds an explicitly forced revision despite irrelevant changes', async () => {
    const run = vi.fn(() => ({ status: 0 }));
    await expect(runInternalUpdate({
      baseline: 'a'.repeat(40), force: true,
      inspection: { changedFiles: ['docs/guide.md'], stale: false },
      makeDirectory: vi.fn(), makeTempDirectory: vi.fn(() => '/tmp/job'),
      pathExists: vi.fn(async () => false), remove: vi.fn(), repositoryRoot: '/repo',
      revision: REVISION, run, stateRoot: '/state', writeBaseline: vi.fn()
    })).resolves.toEqual({ revision: REVISION, status: 'installed' });
    expect(run).toHaveBeenCalledWith('npm', ['run', 'macos:internal:update'], expect.objectContaining({
      cwd: '/tmp/job/source',
      env: expect.objectContaining({ FOLIOLE_RUNTIME_DOWNLOAD_CACHE: '/repo/.cache/desktop-runtime-downloads' })
    }));
  });

  it('ignores an older queued revision without moving the baseline backward', async () => {
    const writeBaseline = vi.fn();
    await expect(runInternalUpdate({
      baseline: 'a'.repeat(40), inspection: { changedFiles: [], stale: true },
      repositoryRoot: '/repo', revision: REVISION, stateRoot: '/state',
      writeBaseline, makeDirectory: vi.fn()
    })).resolves.toEqual({ revision: REVISION, status: 'skipped' });
    expect(writeBaseline).not.toHaveBeenCalled();
  });

  it('cleans the fixed-input source after a failed build without installing later steps', async () => {
    const run = vi.fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 7 });
    const remove = vi.fn();
    await expect(runInternalUpdate({
      makeDirectory: vi.fn(),
      makeTempDirectory: vi.fn(() => '/tmp/job'),
      baseline: null,
      pathExists: vi.fn(async () => false),
      remove,
      repositoryRoot: '/repo',
      revision: REVISION,
      run
    })).rejects.toThrow('expand fixed Internal input failed with exit code 7');
    expect(run).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith('/tmp/job', { force: true, recursive: true });
  });

  it('writes the baseline only after a successful fixed-input build', async () => {
    const writeBaseline = vi.fn();
    await expect(runInternalUpdate({
      baseline: null, makeDirectory: vi.fn(), makeTempDirectory: vi.fn(() => '/tmp/job'),
      pathExists: vi.fn(async () => false), remove: vi.fn(), repositoryRoot: '/repo',
      revision: REVISION, run: vi.fn(() => ({ status: 0 })), stateRoot: '/state', writeBaseline
    })).resolves.toEqual({ revision: REVISION, status: 'installed' });
    expect(writeBaseline).toHaveBeenCalledWith('/state', REVISION);
  });

  it('hands a background failure to Codex Desktop and preserves the original error', async () => {
    const failure = new Error('package failed');
    const submitFailure = vi.fn();
    await expect(runInternalUpdateWithHandoff({
      repositoryRoot: '/repo', revision: REVISION, stateRoot: '/state'
    }, {
      submitFailure, update: vi.fn(async () => { throw failure; })
    })).rejects.toBe(failure);
    expect(submitFailure).toHaveBeenCalledWith(expect.objectContaining({
      error: failure, repositoryRoot: '/repo', revision: REVISION, stateRoot: '/state'
    }));
  });

  it('does not replace the package error when handoff submission also fails', async () => {
    const failure = new Error('package failed');
    const logError = vi.fn();
    await expect(runInternalUpdateWithHandoff({ repositoryRoot: '/repo' }, {
      logError,
      submitFailure: vi.fn(() => { throw new Error('handoff failed'); }),
      update: vi.fn(async () => { throw failure; })
    })).rejects.toBe(failure);
    expect(logError).toHaveBeenCalledWith('Foliole Internal failure handoff failed: handoff failed');
  });
});
