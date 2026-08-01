import { afterEach, expect, it, vi } from 'vitest';

import { DesktopUpdateRetry } from './desktopUpdateRetry.js';

afterEach(() => vi.useRealTimers());

it('runs only the configured number of retry callbacks', async () => {
  vi.useFakeTimers();
  const retry = new DesktopUpdateRetry([10]);
  const callback = vi.fn();

  expect(retry.schedule(callback)).toBe(true);
  expect(retry.schedule(callback)).toBe(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(retry.schedule(callback)).toBe(false);
});
