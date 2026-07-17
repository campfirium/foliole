import { describe, expect, it, vi } from 'vitest';

import { createDogfoodBuildSteps, runDogfoodDailyBuild } from './run-dogfood-daily-build.mjs';

const REVISION = 'b'.repeat(40);

describe('Dogfood Daily fixed-input worker', () => {
  it('builds from an archived revision and an isolated APFS dependency clone', () => {
    const build = createDogfoodBuildSteps({
      repositoryRoot: '/repo', revision: REVISION, temporaryRoot: '/tmp/job'
    });
    expect(build.steps).toEqual([
      expect.objectContaining({ command: 'git', args: ['archive', '--format=tar', '--output=/tmp/job/source.tar', REVISION] }),
      expect.objectContaining({ command: 'tar', args: ['-xf', '/tmp/job/source.tar', '-C', '/tmp/job/source'] }),
      expect.objectContaining({ command: '/bin/cp', args: ['-cR', '/repo/node_modules', '/tmp/job/source/node_modules'] }),
      expect.objectContaining({ command: 'npm', args: ['run', 'macos:mas:dev'], cwd: '/tmp/job/source' })
    ]);
  });

  it('cleans the fixed-input source after a failed build without installing later steps', async () => {
    const run = vi.fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 7 });
    const remove = vi.fn();
    await expect(runDogfoodDailyBuild({
      makeDirectory: vi.fn(),
      makeTempDirectory: vi.fn(() => '/tmp/job'),
      remove,
      repositoryRoot: '/repo',
      revision: REVISION,
      run
    })).rejects.toThrow('expand fixed Dogfood input failed with exit code 7');
    expect(run).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith('/tmp/job', { force: true, recursive: true });
  });
});
