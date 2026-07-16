import { expect, it, vi } from 'vitest';

import { DesktopUpdateService, type DesktopUpdaterAdapter } from './desktopUpdateService.js';

function createHarness(options: { applicable?: boolean; providerVersion?: string | null } = {}) {
  const listeners = new Map<string, (payload?: Record<string, unknown>) => void>();
  const updater = {
    allowDowngrade: true,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(async () => options.providerVersion === null
      ? null
      : { updateInfo: { version: options.providerVersion ?? '0.7.0' } }),
    downloadUpdate: vi.fn(async () => ['installer']),
    on: vi.fn((event: string, listener: (payload?: Record<string, unknown>) => void) => {
      listeners.set(event, listener);
    }),
    quitAndInstall: vi.fn()
  } satisfies DesktopUpdaterAdapter;
  const sender = {
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  };
  const prepareInstall = vi.fn(async () => true);
  const loadUpdater = vi.fn(async () => updater);
  const service = new DesktopUpdateService({
    eventChannel: 'foliole:desktop-update-state',
    isApplicable: () => options.applicable !== false,
    loadUpdater,
    prepareInstall
  });
  return { listeners, loadUpdater, prepareInstall, sender, service, updater };
}

it('does not load or contact the updater outside applicable packaged desktop builds', async () => {
  const harness = createHarness({ applicable: false });

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({ phase: 'not-applicable' });

  expect(harness.loadUpdater).not.toHaveBeenCalled();
  expect(harness.updater.checkForUpdates).not.toHaveBeenCalled();
});

it('treats a provider version mismatch as pending assets instead of an error', async () => {
  const harness = createHarness({ providerVersion: '0.8.0' });

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({
    phase: 'pending-asset',
    version: '0.7.0'
  });

  expect(harness.updater.autoDownload).toBe(false);
  expect(harness.updater.autoInstallOnAppQuit).toBe(false);
  expect(harness.updater.allowDowngrade).toBe(false);
});

it('downloads explicitly, publishes progress, and installs only after preparation succeeds', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);

  const downloadPromise = harness.service.download();
  harness.listeners.get('download-progress')?.({ percent: 42.3, total: 1000, transferred: 423 });
  await expect(downloadPromise).resolves.toMatchObject({ phase: 'ready', version: '0.7.0' });
  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toMatchObject({ phase: 'ready' });
  await harness.service.install();

  expect(harness.sender.send).toHaveBeenCalledWith('foliole:desktop-update-state', expect.objectContaining({
    percent: 42.3,
    phase: 'downloading',
    totalBytes: 1000,
    transferredBytes: 423
  }));
  expect(harness.prepareInstall).toHaveBeenCalledTimes(1);
  expect(harness.updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

it('blocks installation when application data cannot be flushed', async () => {
  const harness = createHarness();
  harness.prepareInstall.mockResolvedValue(false);
  await harness.service.check('0.7.0', harness.sender as never);
  await harness.service.download();

  await expect(harness.service.install()).resolves.toEqual({
    errorCode: 'install-preparation-failed',
    phase: 'error',
    version: '0.7.0'
  });
  expect(harness.updater.quitAndInstall).not.toHaveBeenCalled();
});
