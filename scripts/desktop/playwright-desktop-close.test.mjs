// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const closeOwnedDesktopLaunch = vi.fn();
vi.mock('./playwright-desktop-ownership.mjs', () => ({ closeOwnedDesktopLaunch }));

const { closeDesktopApplication } = await import('./playwright-desktop-close.mjs');

beforeEach(() => closeOwnedDesktopLaunch.mockReset());

it('uses the normal Playwright Electron close path when it completes', async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  await closeDesktopApplication({ close, process: () => ({ pid: 42 }) }, { gracefulTimeoutMs: 1 });
  expect(close).toHaveBeenCalledOnce();
  expect(closeOwnedDesktopLaunch).not.toHaveBeenCalled();
});

it('confirms the owned launch is empty after graceful close', async () => {
  const ownership = { managed: true };
  closeOwnedDesktopLaunch.mockResolvedValueOnce({ confirmedExited: true, reason: 'already-exited' });
  await closeDesktopApplication(
    { close: vi.fn().mockResolvedValue(undefined), process: () => ({ pid: 42 }) },
    { gracefulTimeoutMs: 1, ownership }
  );
  expect(closeOwnedDesktopLaunch).toHaveBeenCalledWith(ownership, undefined);
});

it('terminates a desktop runtime that exceeds the graceful close deadline', async () => {
  const close = vi.fn(() => new Promise(() => {}));
  const ownership = { managed: true };
  closeOwnedDesktopLaunch.mockResolvedValueOnce({ confirmedExited: true });
  await closeDesktopApplication(
    { close, process: () => ({ pid: 42 }) },
    { gracefulTimeoutMs: 1, ownership, ownershipCloseOptions: { termWaitMs: 2 } }
  );
  expect(closeOwnedDesktopLaunch).toHaveBeenCalledWith(ownership, { termWaitMs: 2 });
});

it('treats an already closed Playwright Electron application as closed', async () => {
  const close = vi.fn();
  await closeDesktopApplication({ close, process: () => { throw new TypeError('closed'); } });
  expect(close).not.toHaveBeenCalled();
  expect(closeOwnedDesktopLaunch).not.toHaveBeenCalled();
});
