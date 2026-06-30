import { afterEach, expect, it, vi } from 'vitest';

import { createExternalSearchBackgroundRefreshController } from './externalSearchBackgroundRefresh.js';

afterEach(() => {
  vi.useRealTimers();
});

function createController(args?: {
  now?: () => number;
  rebuild?: () => Promise<unknown>;
  refreshIntervalMs?: number;
  readFolders?: () => Array<{ id: string }>;
  userTriggerMinIntervalMs?: number;
}) {
  return createExternalSearchBackgroundRefreshController({
    initialDelayMs: 1000,
    ...(args?.now ? { now: args.now } : {}),
    readFolders: args?.readFolders as unknown as typeof import('./database/externalSearchFolders.js').loadExternalSearchFolders,
    ...(args?.rebuild ? { rebuild: args.rebuild } : {}),
    ...(args?.refreshIntervalMs === undefined ? {} : { refreshIntervalMs: args.refreshIntervalMs }),
    ...(args?.userTriggerMinIntervalMs === undefined ? {} : { userTriggerMinIntervalMs: args.userTriggerMinIntervalMs })
  });
}

async function advanceStartupDelay() {
  await vi.advanceTimersByTimeAsync(1000);
}

it('delays the startup refresh and skips work when no folders are configured', async () => {
  vi.useFakeTimers();
  const rebuild = vi.fn().mockResolvedValue(undefined);
  const controller = createController({ readFolders: () => [], rebuild });

  controller.start();
  await advanceStartupDelay();

  expect(rebuild).not.toHaveBeenCalled();
  controller.stop();
});

it('runs a delayed refresh and avoids overlapping executions', async () => {
  vi.useFakeTimers();
  const rebuildResolvers: Array<() => void> = [];
  const rebuild = vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        rebuildResolvers.push(resolve);
      })
  );
  const controller = createController({
      readFolders: () => [{ id: 'folder-1' }],
      rebuild,
      refreshIntervalMs: 1000,
    userTriggerMinIntervalMs: 0
  });

  controller.start();
  await advanceStartupDelay();
  expect(rebuild).toHaveBeenCalledTimes(1);

  controller.notifyUserActivity();
  expect(rebuild).toHaveBeenCalledTimes(1);

  const completeFirstRefresh = rebuildResolvers.shift();
  if (completeFirstRefresh) {
    completeFirstRefresh();
  }
  await vi.advanceTimersByTimeAsync(1000);
  expect(rebuild).toHaveBeenCalledTimes(2);
  controller.stop();
});

it('runs an immediate refresh when folders change', async () => {
  vi.useFakeTimers();
  const rebuild = vi.fn().mockResolvedValue(undefined);
  const controller = createController({
    readFolders: () => [{ id: 'folder-1' }],
    rebuild,
    userTriggerMinIntervalMs: 10_000
  });

  controller.start();
  controller.refreshNow();
  await Promise.resolve();

  expect(rebuild).toHaveBeenCalledTimes(1);
  controller.stop();
});

it('pauses pending startup refresh and waits for in-flight work', async () => {
  vi.useFakeTimers();
  const rebuildResolvers: Array<() => void> = [];
  const rebuild = vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        rebuildResolvers.push(resolve);
      })
  );
  const controller = createController({
    readFolders: () => [{ id: 'folder-1' }],
    rebuild
  });

  controller.start();
  await controller.pause();
  await advanceStartupDelay();
  expect(rebuild).not.toHaveBeenCalled();

  controller.refreshNow();
  await Promise.resolve();
  expect(rebuild).toHaveBeenCalledTimes(1);
  const pausePromise = controller.pause();
  let paused = false;
  void pausePromise.then(() => {
    paused = true;
  });
  await Promise.resolve();
  expect(paused).toBe(false);

  rebuildResolvers.shift()?.();
  await pausePromise;
  expect(paused).toBe(true);
  controller.stop();
});

it('throttles user-triggered refreshes', async () => {
  vi.useFakeTimers();
  const rebuild = vi.fn().mockResolvedValue(undefined);
  let currentTime = 0;
  const controller = createController({
    now: () => currentTime,
    readFolders: () => [{ id: 'folder-1' }],
    rebuild,
    userTriggerMinIntervalMs: 5000
  });

  controller.start();
  await advanceStartupDelay();
  await Promise.resolve();
  expect(rebuild).toHaveBeenCalledTimes(1);

  currentTime = 1000;
  controller.notifyUserActivity();
  expect(rebuild).toHaveBeenCalledTimes(1);

  currentTime = 6000;
  controller.notifyUserActivity();
  expect(rebuild).toHaveBeenCalledTimes(2);
  controller.stop();
});
