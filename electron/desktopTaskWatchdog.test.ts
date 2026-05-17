// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { startDesktopTaskWatchdog } from './desktopTaskWatchdog.js';

it('writes app responsive heartbeat events with drift samples', () => {
  const appendEvent = vi.fn(async () => undefined);
  const callbacks: Array<() => void> = [];
  let currentTime = 1000;

  const handle = startDesktopTaskWatchdog({
    appendEvent,
    intervalMs: 250,
    now: () => currentTime,
    scheduleInterval: ((callback: () => void) => {
      callbacks.push(callback);
      return 1 as unknown as NodeJS.Timeout;
    }) as typeof globalThis.setInterval
  });

  currentTime = 1250;
  callbacks[0]?.();
  currentTime = 1800;
  callbacks[0]?.();
  handle.stop();

  expect(appendEvent).toHaveBeenCalledWith('app_responsive', { driftMs: 0, intervalMs: 250 });
  expect(appendEvent).toHaveBeenCalledWith('app_responsive', { driftMs: 300, intervalMs: 250 });
});
