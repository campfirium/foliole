import { describe, expect, it, vi } from 'vitest';

import {
  createDogfoodBuildSteps, resolveDogfoodPackagingDecision, runDogfoodDailyBuild
} from './run-dogfood-daily-build.mjs';

const REVISION = 'b'.repeat(40);

describe('Dogfood Daily fixed-input worker', () => {
  it('builds from an archived revision and an isolated APFS dependency clone', () => {
    const build = createDogfoodBuildSteps({
      includeCodexCache: true, repositoryRoot: '/repo', revision: REVISION, temporaryRoot: '/tmp/job'
    });
    expect(build.steps).toEqual([
      expect.objectContaining({ command: 'git', args: ['archive', '--format=tar', '--output=/tmp/job/source.tar', REVISION] }),
      expect.objectContaining({ command: 'tar', args: ['-xf', '/tmp/job/source.tar', '-C', '/tmp/job/source'] }),
      expect.objectContaining({ command: '/bin/cp', args: ['-cR', '/repo/node_modules', '/tmp/job/source/node_modules'] }),
      expect.objectContaining({ command: '/bin/mkdir', args: ['-p', '/tmp/job/source/.tmp/macos'] }),
      expect.objectContaining({ command: '/bin/cp', args: ['-cR', '/repo/.tmp/macos/codex', '/tmp/job/source/.tmp/macos/codex'] }),
      expect.objectContaining({ command: 'npm', args: ['run', 'macos:mas:dev'], cwd: '/tmp/job/source' })
    ]);
  });

  it('skips only when every changed path is explicitly irrelevant', () => {
    expect(resolveDogfoodPackagingDecision(['docs/guide.md', 'scripts/check-structure-boundary.mjs'])).toBe('skip');
    expect(resolveDogfoodPackagingDecision(['docs/guide.md', 'scripts/macos/package-mas.mjs'])).toBe('build');
    expect(resolveDogfoodPackagingDecision([])).toBe('skip');
  });

  it('advances the baseline without building for irrelevant changes', async () => {
    const run = vi.fn();
    const writeBaseline = vi.fn();
    await expect(runDogfoodDailyBuild({
      baseline: 'a'.repeat(40), inspection: { changedFiles: ['docs/guide.md'], stale: false },
      repositoryRoot: '/repo', revision: REVISION, run, stateRoot: '/state',
      writeBaseline, makeDirectory: vi.fn()
    })).resolves.toEqual({ revision: REVISION, status: 'skipped' });
    expect(run).not.toHaveBeenCalled();
    expect(writeBaseline).toHaveBeenCalledWith('/state', REVISION);
  });

  it('ignores an older queued revision without moving the baseline backward', async () => {
    const writeBaseline = vi.fn();
    await expect(runDogfoodDailyBuild({
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
    await expect(runDogfoodDailyBuild({
      makeDirectory: vi.fn(),
      makeTempDirectory: vi.fn(() => '/tmp/job'),
      baseline: null,
      pathExists: vi.fn(async () => false),
      remove,
      repositoryRoot: '/repo',
      revision: REVISION,
      run
    })).rejects.toThrow('expand fixed Dogfood input failed with exit code 7');
    expect(run).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith('/tmp/job', { force: true, recursive: true });
  });

  it('writes the baseline only after a successful fixed-input build', async () => {
    const writeBaseline = vi.fn();
    await expect(runDogfoodDailyBuild({
      baseline: null, makeDirectory: vi.fn(), makeTempDirectory: vi.fn(() => '/tmp/job'),
      pathExists: vi.fn(async () => false), remove: vi.fn(), repositoryRoot: '/repo',
      revision: REVISION, run: vi.fn(() => ({ status: 0 })), stateRoot: '/state', writeBaseline
    })).resolves.toEqual({ revision: REVISION, status: 'installed' });
    expect(writeBaseline).toHaveBeenCalledWith('/state', REVISION);
  });
});
