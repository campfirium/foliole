// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { waitForDesktopRootWindow } from './playwright-desktop-window.mjs';

it('retries when navigation destroys the current execution context', async () => {
  const page = {
    evaluate: vi.fn()
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
      .mockResolvedValueOnce(true),
    waitForLoadState: vi.fn().mockResolvedValue(undefined)
  };
  const electronApp = {
    firstWindow: vi.fn().mockResolvedValue(page),
    windows: vi.fn(() => [page])
  };

  await expect(waitForDesktopRootWindow(electronApp, 1_000)).resolves.toBe(page);
  expect(page.evaluate).toHaveBeenCalledTimes(2);
});
