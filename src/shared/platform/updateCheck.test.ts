import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  checkForFolioleUpdates,
  compareVersionStrings,
  getNextUpdateCheckDelayMs,
  normalizeUpdateManifest,
  readUpdateCheckState,
  selectLatestPlatformRelease
} from './updateCheck';

function createMockElectronApi(invoke: NativeInvoke) {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

function createManifest() {
  return {
    schemaVersion: 1,
    channel: 'beta',
    checkPolicy: { failureRetryMinutes: 15, intervalMinutes: 60 },
    releases: [
      { version: '0.2.0', platforms: ['android'], url: 'https://example.com/android' },
      { version: '0.1.2', platforms: ['windows'], url: 'https://example.com/windows-012' },
      { version: '0.1.1', platforms: ['windows'], url: 'https://example.com/windows-011' }
    ]
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-31T00:00:00.000Z'));
  window.localStorage.clear();
  delete window.electronAPI;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

it('selects the newest Windows release above the installed version', () => {
  const manifest = normalizeUpdateManifest(createManifest());

  expect(manifest).not.toBeNull();
  expect(selectLatestPlatformRelease(manifest!, '0.1.0')).toMatchObject({
    url: 'https://example.com/windows-012',
    version: '0.1.2'
  });
  expect(selectLatestPlatformRelease(manifest!, '0.1.2')).toBeNull();
});

it('compares dotted release versions numerically', () => {
  expect(compareVersionStrings('0.10.0', '0.2.9')).toBeGreaterThan(0);
  expect(compareVersionStrings('v1.0.0', '1.0.0')).toBe(0);
});

it('checks the static manifest and persists the latest release state', async () => {
  const invoke = vi.fn().mockResolvedValue('0.1.0');
  window.electronAPI = createMockElectronApi(invoke);
  vi.mocked(fetch).mockResolvedValue({
    json: async () => createManifest(),
    ok: true
  } as Response);

  await expect(checkForFolioleUpdates({ force: true })).resolves.toMatchObject({
    latestRelease: { version: '0.1.2' },
    status: 'available'
  });

  expect(invoke).toHaveBeenCalledWith('app_get_version');
  expect(readUpdateCheckState()).toMatchObject({
    lastCheckStatus: 'available',
    latestReleaseUrl: 'https://example.com/windows-012',
    latestVersion: '0.1.2'
  });
});

it('uses the beta hourly policy to avoid repeated automatic requests', async () => {
  vi.mocked(fetch).mockResolvedValue({
    json: async () => createManifest(),
    ok: true
  } as Response);

  await checkForFolioleUpdates({ force: true });
  vi.setSystemTime(new Date('2026-05-31T00:30:00.000Z'));

  await expect(checkForFolioleUpdates()).resolves.toMatchObject({ status: 'skipped' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(getNextUpdateCheckDelayMs()).toBe(30 * 60 * 1000);
});

it('records failures with a shorter retry delay', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

  await expect(checkForFolioleUpdates({ force: true })).resolves.toMatchObject({ status: 'failed' });

  expect(readUpdateCheckState().lastCheckStatus).toBe('failed');
  expect(getNextUpdateCheckDelayMs()).toBe(15 * 60 * 1000);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState)).toContain('failed');
});
