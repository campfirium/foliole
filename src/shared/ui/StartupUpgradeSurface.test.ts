import { act } from '@testing-library/react';
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

  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(progressBar()).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(document.body.textContent).not.toContain('Updating your library');
  expect(progressBar()).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(progressBar()).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(progressBar()).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(loadStatus).toHaveBeenCalledTimes(4);
});

it('stays out of the way when the desktop host cannot report upgrade status', async () => {
  const loadStatus = vi.fn(async (): Promise<NativeDatabaseUpgradeStatus> => { throw new Error('unsupported'); });
  watchStartupDatabaseUpgrade(loadStatus);
  await vi.waitFor(() => expect(loadStatus).toHaveBeenCalledTimes(1));
  expect(progressBar()).toBeNull();
});

it('keeps brief upgrades free of text and reveals details only after two seconds', async () => {
  vi.useFakeTimers();
  const loadStatus = vi.fn(async (): Promise<NativeDatabaseUpgradeStatus> => ({ state: 'upgrading', completed: 1, total: 4 }));
  watchStartupDatabaseUpgrade(loadStatus);
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(document.body.textContent).not.toContain('Updating your library');
  expect(progressBar()).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1999));
  expect(document.body.textContent).not.toContain('Updating your library');
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(document.body.textContent).toContain('Updating your library');
  expect(progressBar()?.getAttribute('aria-valuenow')).toBe('25');
  loadStatus.mockResolvedValue({ state: 'ready' });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(progressBar()).toBeNull();
});

it('times starting and upgrading as one wait and cleans up when disposed', async () => {
  vi.useFakeTimers();
  const loadStatus = vi.fn(async (): Promise<NativeDatabaseUpgradeStatus> => ({ state: 'starting' }));
  const dispose = watchStartupDatabaseUpgrade(loadStatus);
  await act(() => vi.advanceTimersByTimeAsync(1999));
  expect(document.body.textContent).toBe('');
  loadStatus.mockResolvedValue({ state: 'upgrading', completed: 2, total: 4 });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(document.body.textContent).toContain('Updating your library');
  expect(progressBar()?.getAttribute('aria-valuenow')).toBe('50');
  act(dispose);
  expect(document.querySelector('[data-startup-upgrade]')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not show a late status response after disposal', async () => {
  vi.useFakeTimers();
  let resolve!: (status: NativeDatabaseUpgradeStatus) => void;
  const dispose = watchStartupDatabaseUpgrade(() => new Promise((done) => { resolve = done; }));
  dispose();
  await act(async () => resolve({ state: 'upgrading', completed: 1, total: 3 }));
  expect(document.querySelector('[data-startup-upgrade]')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
