// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { createBeforeQuitCoordinator } from './beforeQuitCoordinator.js';

async function settlePromiseCallbacks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

it('defers a quit retry after an immediately completed flush and allows that retry to exit', async () => {
  let scheduledQuit: (() => void) | undefined;
  const flush = vi.fn().mockResolvedValue(undefined);
  const quit = vi.fn();
  const coordinateBeforeQuit = createBeforeQuitCoordinator({
    flush,
    onPrepareError: vi.fn(),
    onFlushError: vi.fn(),
    prepare: vi.fn(),
    quit,
    scheduleQuit: (callback) => {
      scheduledQuit = callback;
    }
  });
  const initialEvent = { preventDefault: vi.fn() };

  coordinateBeforeQuit(initialEvent);
  await settlePromiseCallbacks();

  expect(initialEvent.preventDefault).toHaveBeenCalledTimes(1);
  expect(flush).toHaveBeenCalledTimes(1);
  expect(quit).not.toHaveBeenCalled();
  expect(scheduledQuit).toBeTypeOf('function');

  scheduledQuit?.();
  expect(quit).toHaveBeenCalledTimes(1);

  const retryEvent = { preventDefault: vi.fn() };
  coordinateBeforeQuit(retryEvent);
  expect(retryEvent.preventDefault).not.toHaveBeenCalled();
  expect(flush).toHaveBeenCalledTimes(1);
});

it('continues to the deferred quit retry when flushing fails', async () => {
  const error = new Error('mirror flush failed');
  const onFlushError = vi.fn();
  const scheduleQuit = vi.fn();
  const coordinateBeforeQuit = createBeforeQuitCoordinator({
    flush: vi.fn().mockRejectedValue(error),
    onPrepareError: vi.fn(),
    onFlushError,
    prepare: vi.fn(),
    quit: vi.fn(),
    scheduleQuit
  });

  coordinateBeforeQuit({ preventDefault: vi.fn() });
  await settlePromiseCallbacks();

  expect(onFlushError).toHaveBeenCalledWith(error);
  expect(scheduleQuit).toHaveBeenCalledTimes(1);
});
