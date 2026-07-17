// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { createInternalLifecycle } from './internal-lifecycle.mjs';

it('checks the exact Foliole Internal bundle id', () => {
  const run = vi.fn(() => ({ status: 0, stdout: 'true\n' }));
  const lifecycle = createInternalLifecycle({ run, targetPath: '/Applications/Foliole.app' });

  expect(lifecycle.isRunning()).toBe(true);
  expect(run).toHaveBeenCalledWith('osascript', [
    '-e', 'application id "com.campfirium.foliole" is running'
  ], { encoding: 'utf8' });
});

it('uses the process-exit helper as the bounded cooperative quit wait', async () => {
  const run = vi.fn(() => ({ status: 0 }));
  const lifecycle = createInternalLifecycle({ run, targetPath: '/Applications/Foliole.app' });

  await lifecycle.quitAndWait();

  expect(run).toHaveBeenCalledOnce();
  expect(run).toHaveBeenCalledWith('xcrun', [
    'swift', expect.stringMatching(/wait-for-app-exit\.swift$/),
    'com.campfirium.foliole', '30000'
  ], { stdio: 'inherit', timeout: 40_000 });
});

it('fails closed when the cooperative quit command times out', async () => {
  const timeoutError = Object.assign(new Error('spawnSync xcrun ETIMEDOUT'), { code: 'ETIMEDOUT' });
  const run = vi.fn(() => ({ error: timeoutError, status: null }));
  const lifecycle = createInternalLifecycle({
    run, targetPath: '/Applications/Foliole.app', timeoutMs: 1
  });

  await expect(lifecycle.quitAndWait()).rejects.toThrow('Timed out waiting for Foliole to exit');
  expect(run).toHaveBeenCalledWith('xcrun', expect.any(Array), {
    stdio: 'inherit', timeout: 10_001
  });
});

it('preserves a cooperative quit failure', async () => {
  const run = vi.fn(() => ({ status: 1 }));
  const lifecycle = createInternalLifecycle({ run, targetPath: '/Applications/Foliole.app' });

  await expect(lifecycle.quitAndWait()).rejects.toThrow(
    'request and wait for Foliole Internal quit failed with exit code 1'
  );
});
