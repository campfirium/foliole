import { afterEach, expect, it, vi } from 'vitest';

import type { NativeDatabaseUpgradeStatus } from '../../../lib/platform/nativeDatabaseUpgradeContract';

import { watchStartupDatabaseUpgrade } from './StartupUpgradeSurface';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function progressBar() {
  return document.querySelector<HTMLElement>('[role="progressbar"]');
}

it('covers startup while an older library is upgraded and removes itself when the library is ready', async () => {
  vi.useFakeTimers();
  const statuses: NativeDatabaseUpgradeStatus[] = [
    { state: 'starting' },
    { completed: 0, state: 'upgrading', total: 4 },
    { completed: 3, state: 'upgrading', total: 4 },
    { state: 'ready' }
  ];
  const loadStatus = vi.fn(async () => statuses.shift() ?? { state: 'ready' as const });
  watchStartupDatabaseUpgrade(loadStatus);

  await vi.advanceTimersByTimeAsync(0);
  expect(progressBar()).toBeNull();
  await vi.advanceTimersByTimeAsync(500);
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Updating your library');
  expect(progressBar()?.getAttribute('aria-valuenow')).toBe('0');
  await vi.advanceTimersByTimeAsync(500);
  expect(progressBar()?.getAttribute('aria-valuenow')).toBe('75');
  await vi.advanceTimersByTimeAsync(500);
  expect(progressBar()).toBeNull();
  await vi.advanceTimersByTimeAsync(2000);
  expect(loadStatus).toHaveBeenCalledTimes(4);
});

it('stays out of the way when the desktop host cannot report upgrade status', async () => {
  const loadStatus = vi.fn(async (): Promise<NativeDatabaseUpgradeStatus> => { throw new Error('unsupported'); });
  watchStartupDatabaseUpgrade(loadStatus);
  await vi.waitFor(() => expect(loadStatus).toHaveBeenCalledTimes(1));
  expect(progressBar()).toBeNull();
});
