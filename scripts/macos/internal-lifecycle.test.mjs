// @vitest-environment node
/* global queueMicrotask */
import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import { createInternalLifecycle } from './internal-lifecycle.mjs';

function createChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = vi.fn();
  return child;
}

it('checks the exact Foliole Internal bundle id', () => {
  const run = vi.fn(() => ({ status: 0, stdout: 'true\n' }));
  const lifecycle = createInternalLifecycle({ run, targetPath: '/Applications/Foliole.app' });

  expect(lifecycle.isRunning()).toBe(true);
  expect(run).toHaveBeenCalledWith('osascript', [
    '-e', 'application id "com.campfirium.foliole" is running'
  ], { encoding: 'utf8' });
});

it('starts the system exit waiter before requesting quit', async () => {
  const child = createChild();
  const events = [];
  const start = vi.fn(() => {
    events.push('waiter');
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  const run = vi.fn(() => {
    events.push('quit');
    child.exitCode = 0;
    child.emit('exit', 0);
    return { status: 0 };
  });
  const lifecycle = createInternalLifecycle({ run, start, targetPath: '/Applications/Foliole.app' });

  await lifecycle.quitAndWait();

  expect(events).toEqual(['waiter', 'quit']);
  expect(start).toHaveBeenCalledWith('open', [
    '-W', '-g', '-a', '/Applications/Foliole.app'
  ], { stdio: 'ignore' });
});

it('fails closed when the system exit waiter times out', async () => {
  const child = createChild();
  const start = vi.fn(() => {
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  const run = vi.fn(() => ({ status: 0 }));
  const lifecycle = createInternalLifecycle({
    run, start, targetPath: '/Applications/Foliole.app', timeoutMs: 1
  });

  await expect(lifecycle.quitAndWait()).rejects.toThrow('Timed out waiting for Foliole to exit');
  expect(child.kill).toHaveBeenCalled();
});

it('stops the waiter and preserves a cooperative quit failure', async () => {
  const child = createChild();
  child.kill.mockImplementation(() => {
    child.exitCode = 1;
    child.emit('exit', 1);
  });
  const start = vi.fn(() => {
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  const run = vi.fn(() => ({ status: 1 }));
  const lifecycle = createInternalLifecycle({ run, start, targetPath: '/Applications/Foliole.app' });

  await expect(lifecycle.quitAndWait()).rejects.toThrow(
    'request Foliole Internal quit failed with exit code 1'
  );
  expect(child.kill).toHaveBeenCalledOnce();
});
