import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  checkForFolioleUpdates,
  compareVersionStrings,
  getNextUpdateCheckDelayMs,
  normalizeReleaseNotesCatalog,
  normalizeUpdateManifest,
  readUpdateCheckState,
  selectLatestPlatformRelease,
  selectSkippedPlatformReleases,
  subscribeUpdateCheckState
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
      { version: '0.1.3', platforms: ['windows'], url: 'https://example.com/windows-013' },
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
    url: 'https://example.com/windows-013',
    version: '0.1.3'
  });
  expect(selectLatestPlatformRelease(manifest!, '0.1.3')).toBeNull();
});

it('selects skipped Windows releases between the installed and latest versions', () => {
  const manifest = normalizeUpdateManifest(createManifest());

  expect(selectSkippedPlatformReleases(manifest, '0.1.1', '0.1.3').map((release) => release.version)).toEqual([
    '0.1.2',
    '0.1.3'
  ]);
});

it('compares dotted release versions numerically', () => {
  expect(compareVersionStrings('0.10.0', '0.2.9')).toBeGreaterThan(0);
  expect(compareVersionStrings('v1.0.0', '1.0.0')).toBe(0);
});

it('normalizes release notes catalogs by version', () => {
  expect(normalizeReleaseNotesCatalog({
    '0.1.2': { notes: ['Improves update details.'], summary: 'Update details' },
    ignored: { notes: [false] }
  })).toEqual({
    '0.1.2': { notes: ['Improves update details.'], summary: 'Update details' }
  });
});

it('checks the static manifest and persists the latest release state', async () => {
  const invoke = vi.fn().mockResolvedValue('0.1.0');
  window.electronAPI = createMockElectronApi(invoke);
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      json: async () => createManifest(),
      ok: true
    } as Response)
    .mockResolvedValueOnce({
      json: async () => ({ '0.1.3': { notes: ['New update details.'] } }),
      ok: true
    } as Response)
    .mockResolvedValueOnce({
      json: async () => ({ '0.1.3': { notes: ['新的更新说明。'] } }),
      ok: true
    } as Response);

  await expect(checkForFolioleUpdates({ force: true })).resolves.toMatchObject({
    latestRelease: { version: '0.1.3' },
    status: 'available'
  });

  expect(invoke).toHaveBeenCalledWith('app_get_version');
  expect(readUpdateCheckState()).toMatchObject({
    cachedReleaseNotes: {
      en: { '0.1.3': { notes: ['New update details.'] } },
      'zh-Hans': { '0.1.3': { notes: ['新的更新说明。'] } }
    },
    lastCheckStatus: 'available',
    latestReleaseUrl: 'https://example.com/windows-013',
    latestVersion: '0.1.3'
  });
});

it('keeps the update available when release notes fail to load', async () => {
  const invoke = vi.fn().mockResolvedValue('0.1.0');
  window.electronAPI = createMockElectronApi(invoke);
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      json: async () => createManifest(),
      ok: true
    } as Response)
    .mockResolvedValue({ ok: false, status: 404 } as Response);

  await expect(checkForFolioleUpdates({ force: true })).resolves.toMatchObject({
    latestRelease: { version: '0.1.3' },
    status: 'available'
  });

  expect(readUpdateCheckState()).toMatchObject({
    cachedReleaseNotes: null,
    lastCheckStatus: 'available',
    latestVersion: '0.1.3'
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

it('notifies subscribers when the persisted update state changes', async () => {
  vi.mocked(fetch).mockResolvedValue({
    json: async () => createManifest(),
    ok: true
  } as Response);
  const subscriber = vi.fn();
  const unsubscribe = subscribeUpdateCheckState(subscriber);

  await checkForFolioleUpdates({ force: true });

  expect(subscriber).toHaveBeenCalledTimes(1);
  unsubscribe();
});
