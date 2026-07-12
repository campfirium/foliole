// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const killPid = vi.fn();
vi.mock('../lib/process-control.mjs', () => ({ killPid }));

const { closeDesktopApplication } = await import('./playwright-desktop-close.mjs');

beforeEach(() => killPid.mockReset());

it('uses the normal Playwright Electron close path when it completes', async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  await closeDesktopApplication({ close, process: () => ({ pid: 42 }) }, { gracefulTimeoutMs: 1 });
  expect(close).toHaveBeenCalledOnce();
  expect(killPid).not.toHaveBeenCalled();
});

it('terminates a desktop runtime that exceeds the graceful close deadline', async () => {
  const close = vi.fn(() => new Promise(() => {}));
  await closeDesktopApplication({ close, process: () => ({ pid: 42 }) }, { gracefulTimeoutMs: 1 });
  expect(killPid).toHaveBeenCalledWith(42, { timeoutMs: 3000 });
});
