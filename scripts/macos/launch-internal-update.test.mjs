/* global process, queueMicrotask */

import { EventEmitter } from 'node:events';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  assertInternalSigningAvailable, createInternalLaunchCommand, launchInternalUpdate,
  resolveInternalRevision
} from './launch-internal-update.mjs';

const REVISION = 'a'.repeat(40);

describe('Internal update launcher', () => {
  it('pins the current full Git revision', () => {
    const run = vi.fn(() => ({ status: 0, stdout: `${REVISION}\n` }));
    expect(resolveInternalRevision('/repo', run)).toBe(REVISION);
    expect(run).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], {
      cwd: '/repo', encoding: 'utf8'
    });
  });

  it('uses the macOS ordered file lock for serialized background builds', () => {
    expect(createInternalLaunchCommand({
      lockPath: '/state/build.lock', repositoryRoot: '/repo', revision: REVISION,
      stateRoot: '/state', workerPath: '/worker.mjs'
    })).toEqual({
      args: [
        '-k', '/state/build.lock', process.execPath, '/worker.mjs', '--revision', REVISION,
        '--repository', '/repo', '--state-root', '/state'
      ],
      bin: '/usr/bin/lockf'
    });
  });

  it('skips safely outside macOS without spawning a worker', async () => {
    const start = vi.fn();
    await expect(launchInternalUpdate({
      platform: 'win32', repositoryRoot: '/repo', revision: REVISION, start
    })).resolves.toEqual({ reason: 'unsupported-platform', revision: REVISION, status: 'skipped' });
    expect(start).not.toHaveBeenCalled();
  });

  it('fails before dispatch when the host signing identity is unavailable', () => {
    const run = vi.fn(() => ({ status: 0, stdout: '0 valid identities found' }));
    expect(() => assertInternalSigningAvailable(run)).toThrow(
      'requires the host macOS context with an Apple Development identity'
    );
  });

  it('detaches the worker and returns after spawn', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 42, unref: vi.fn() });
    const start = vi.fn(() => {
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });
    const closeFile = vi.fn();
    const result = await launchInternalUpdate({
      closeFile,
      makeDirectory: vi.fn(),
      openFile: vi.fn(() => 9),
      repositoryRoot: '/repo',
      revision: REVISION,
      start,
      stateRoot: '/state',
      verifySigning: vi.fn(),
      workerPath: '/worker.mjs'
    });
    expect(result).toEqual({
      logPath: path.join('/state', 'build.log'), pid: 42,
      revision: REVISION, status: 'dispatched'
    });
    expect(start.mock.calls[0][2]).toMatchObject({ cwd: '/repo', detached: true, stdio: ['ignore', 9, 9] });
    expect(child.unref).toHaveBeenCalledOnce();
    expect(closeFile).toHaveBeenCalledWith(9);
  });
});
