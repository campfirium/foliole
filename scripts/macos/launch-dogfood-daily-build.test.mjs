/* global process, queueMicrotask */

import { EventEmitter } from 'node:events';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createDogfoodLaunchCommand, launchDogfoodDailyBuild, resolveDogfoodRevision
} from './launch-dogfood-daily-build.mjs';

const REVISION = 'a'.repeat(40);

describe('Dogfood Daily build launcher', () => {
  it('pins the current full Git revision', () => {
    const run = vi.fn(() => ({ status: 0, stdout: `${REVISION}\n` }));
    expect(resolveDogfoodRevision('/repo', run)).toBe(REVISION);
    expect(run).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], {
      cwd: '/repo', encoding: 'utf8'
    });
  });

  it('uses the macOS ordered file lock for serialized background builds', () => {
    expect(createDogfoodLaunchCommand({
      lockPath: '/state/build.lock', repositoryRoot: '/repo', revision: REVISION, workerPath: '/worker.mjs'
    })).toEqual({
      args: ['-k', '/state/build.lock', process.execPath, '/worker.mjs', '--revision', REVISION, '--repository', '/repo'],
      bin: '/usr/bin/lockf'
    });
  });

  it('dispatches detached work and returns after spawn', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 42, unref: vi.fn() });
    const start = vi.fn(() => {
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });
    const closeFile = vi.fn();
    const result = await launchDogfoodDailyBuild({
      closeFile,
      makeDirectory: vi.fn(),
      openFile: vi.fn(() => 9),
      repositoryRoot: '/repo',
      revision: REVISION,
      start,
      stateRoot: '/state',
      workerPath: '/worker.mjs'
    });
    expect(result).toEqual({ logPath: path.join('/state', 'build.log'), pid: 42, revision: REVISION });
    expect(start.mock.calls[0][2]).toMatchObject({ cwd: '/repo', detached: true, stdio: ['ignore', 9, 9] });
    expect(child.unref).toHaveBeenCalledOnce();
    expect(closeFile).toHaveBeenCalledWith(9);
  });
});
