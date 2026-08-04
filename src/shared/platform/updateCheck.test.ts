import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { FOLIOLE_RELEASE_LINKS } from './releaseLinks';
import {
  checkForFolioleUpdates,
  compareVersionStrings,
  getNextUpdateCheckDelayMs,
  normalizeReleaseNotesCatalog,
  normalizeUpdateManifest,
  openFolioleLatestRelease,
  readUpdateCheckState,
  selectLatestPlatformRelease,
  selectSkippedPlatformReleases,
  subscribeUpdateCheckState
} from './updateCheck';

const appVersion = vi.hoisted(() => ({ loadAppVersion: vi.fn<() => Promise<string>>() }));

vi.mock('./appVersion', () => ({ loadAppVersion: appVersion.loadAppVersion }));

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
      { version: '0.2.0', platforms: ['android'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.2.0' },
      { version: '0.1.3', platforms: ['linux', 'macos', 'windows'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.1.3' },
      { version: '0.1.2', platforms: ['linux', 'macos', 'windows'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.1.2' },
      { version: '0.1.1', platforms: ['linux', 'macos', 'windows'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.1.1' }
    ]
  };
}

const WINDOWS_TARGET = { architecture: 'x64', platform: 'windows' } as const;
const MACOS_TARGET = { architecture: 'arm64', platform: 'macos' } as const;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-31T00:00:00.000Z'));
  window.localStorage.clear();
  delete window.electronAPI;
  globalThis.fetch = vi.fn();
  appVersion.loadAppVersion.mockReset().mockResolvedValue('0.1.0');
});

afterEach(() => {
  vi.useRealTimers();
});

it('selects the newest Windows release above the installed version', () => {
  const manifest = normalizeUpdateManifest(createManifest());

  expect(manifest).not.toBeNull();
  expect(selectLatestPlatformRelease(manifest!, '0.1.0', WINDOWS_TARGET)).toMatchObject({
    url: 'https://github.com/campfirium/foliole/releases/tag/v0.1.3',
    version: '0.1.3'
  });
  expect(selectLatestPlatformRelease(manifest!, '0.1.3', WINDOWS_TARGET)).toBeNull();
});

it('selects only the matching macOS architecture without changing Windows selection', () => {
  const manifest = normalizeUpdateManifest({
    schemaVersion: 1,
    releases: [
      { architectures: ['arm64'], platforms: ['macos'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.2.0', version: '0.2.0' },
      { architectures: ['x64'], platforms: ['macos'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.3.0', version: '0.3.0' },
      { platforms: ['windows'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.4.0', version: '0.4.0' }
    ]
  });

  expect(selectLatestPlatformRelease(manifest!, '0.1.0', MACOS_TARGET)?.version).toBe('0.2.0');
  expect(selectLatestPlatformRelease(manifest!, '0.1.0', WINDOWS_TARGET)?.version).toBe('0.4.0');
});

it('filters release URLs outside the official GitHub releases path', () => {
  const manifest = normalizeUpdateManifest({
    schemaVersion: 1,
    releases: [
      { version: '0.1.6', platforms: ['windows'], url: 'https://github.com/campfirium/foliole/releases/download/v0.1.6/Foliole.exe' },
      { version: '0.1.5', platforms: ['windows'], url: 'http://github.com/campfirium/foliole/releases/tag/v0.1.5' },
      { version: '0.1.4', platforms: ['windows'], url: 'https://evil.example/releases/tag/v0.1.4' },
      { version: '0.1.3', platforms: ['windows'], url: 'https://github.com.evil.example/campfirium/foliole/releases/tag/v0.1.3' },
      { version: '0.1.2', platforms: ['windows'], url: 'https://github.com/other/repo/releases/tag/v0.1.2' },
      { version: '0.1.1', platforms: ['windows'], url: 'not a url' }
    ]
  });

  expect(manifest?.releases).toEqual([
    {
      platforms: ['windows'],
      url: 'https://github.com/campfirium/foliole/releases/download/v0.1.6/Foliole.exe',
      version: '0.1.6'
    }
  ]);
});

it('selects skipped Windows releases between the installed and latest versions', () => {
  const manifest = normalizeUpdateManifest(createManifest());

  expect(selectSkippedPlatformReleases(manifest, '0.1.1', '0.1.3', WINDOWS_TARGET).map((release) => release.version)).toEqual([
    '0.1.3',
    '0.1.2'
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

  expect(readUpdateCheckState()).toMatchObject({
    cachedReleaseNotes: {
      en: { '0.1.3': { notes: ['New update details.'] } },
      'zh-Hans': { '0.1.3': { notes: ['新的更新说明。'] } }
    },
    lastCheckStatus: 'available',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.1.3',
    latestVersion: '0.1.3'
  });
});

it('drops untrusted cached release URLs and falls back to the official releases page', async () => {
  const invoke = vi.fn().mockResolvedValue(null);
  window.electronAPI = createMockElectronApi(invoke);
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
    ...readUpdateCheckState(),
    latestReleaseUrl: 'https://evil.example/download'
  }));

  expect(readUpdateCheckState().latestReleaseUrl).toBeNull();
  await openFolioleLatestRelease();

  expect(invoke).toHaveBeenCalledWith('open_external_url', { url: FOLIOLE_RELEASE_LINKS.releases });
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
  const firstCheckRequestCount = vi.mocked(fetch).mock.calls.length;
  vi.setSystemTime(new Date('2026-05-31T00:30:00.000Z'));

  await expect(checkForFolioleUpdates()).resolves.toMatchObject({ status: 'skipped' });
  expect(fetch).toHaveBeenCalledTimes(firstCheckRequestCount);
  expect(getNextUpdateCheckDelayMs()).toBe(30 * 60 * 1000);
});

it('clears a cached available release after that version is installed', async () => {
  let installedVersion = '0.1.0';
  appVersion.loadAppVersion.mockImplementation(async () => installedVersion);
  const invoke = vi.fn().mockResolvedValue({ phase: 'idle' });
  window.electronAPI = createMockElectronApi(invoke);
  vi.mocked(fetch).mockResolvedValue({ json: async () => createManifest(), ok: true } as Response);

  await checkForFolioleUpdates({ force: true });
  installedVersion = '0.1.3';
  vi.setSystemTime(new Date('2026-05-31T00:30:00.000Z'));

  await expect(checkForFolioleUpdates()).resolves.toMatchObject({ status: 'current' });
  expect(readUpdateCheckState()).toMatchObject({
    lastCheckStatus: 'current',
    latestReleaseUrl: null,
    latestVersion: null
  });
  expect(fetch).toHaveBeenCalledTimes(3);
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
