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

it('uses the cooperative quit command itself as the bounded exit wait', async () => {
  const run = vi.fn(() => ({ status: 0 }));
  const lifecycle = createInternalLifecycle({ run, targetPath: '/Applications/Foliole.app' });

  await lifecycle.quitAndWait();

  expect(run).toHaveBeenCalledOnce();
  expect(run).toHaveBeenCalledWith('osascript', [
    '-e', 'tell application id "com.campfirium.foliole" to quit'
  ], { stdio: 'ignore', timeout: 30_000 });
});

it('fails closed when the cooperative quit command times out', async () => {
  const timeoutError = Object.assign(new Error('spawnSync osascript ETIMEDOUT'), { code: 'ETIMEDOUT' });
  const run = vi.fn(() => ({ error: timeoutError, status: null }));
  const lifecycle = createInternalLifecycle({
    run, targetPath: '/Applications/Foliole.app', timeoutMs: 1
  });

  await expect(lifecycle.quitAndWait()).rejects.toThrow('Timed out waiting for Foliole to exit');
  expect(run).toHaveBeenCalledWith('osascript', expect.any(Array), {
    stdio: 'ignore', timeout: 1
  });
});

it('preserves a cooperative quit failure', async () => {
  const run = vi.fn(() => ({ status: 1 }));
  const lifecycle = createInternalLifecycle({ run, targetPath: '/Applications/Foliole.app' });

  await expect(lifecycle.quitAndWait()).rejects.toThrow(
    'request Foliole Internal quit failed with exit code 1'
  );
});
