// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { startDesktopTaskWatchdog } from './desktopTaskWatchdog.js';

it('writes first app responsive sample and later slow drift samples only', () => {
  const appendEvent = vi.fn(async () => undefined);
  const callbacks: Array<() => void> = [];
  let currentTime = 1000;

  const handle = startDesktopTaskWatchdog({
    appendEvent,
    intervalMs: 250,
    minDriftMs: 100,
    now: () => currentTime,
    scheduleInterval: ((callback: () => void) => {
      callbacks.push(callback);
      return 1 as unknown as NodeJS.Timeout;
    }) as typeof globalThis.setInterval
  });

  currentTime = 1250;
  callbacks[0]?.();
  currentTime = 1510;
  callbacks[0]?.();
  currentTime = 1900;
  callbacks[0]?.();
  handle.stop();

  expect(appendEvent).toHaveBeenCalledWith('app_responsive', { driftMs: 0, intervalMs: 250 });
  expect(appendEvent).toHaveBeenCalledWith('app_responsive', { driftMs: 140, intervalMs: 250 });
  expect(appendEvent).toHaveBeenCalledTimes(2);
});
