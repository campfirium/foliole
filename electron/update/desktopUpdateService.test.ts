import { afterEach, expect, it, vi } from 'vitest';

import { createDesktopUpdateServiceHarness as createHarness } from './desktopUpdateService.testSupport.js';

afterEach(() => vi.useRealTimers());

it('does not load or contact the updater outside applicable packaged desktop builds', async () => {
  const harness = createHarness({ applicable: false });

  expect(harness.isApplicable).not.toHaveBeenCalled();
  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({ phase: 'not-applicable' });

  expect(harness.isApplicable).toHaveBeenCalledTimes(1);
  expect(harness.loadUpdater).not.toHaveBeenCalled();
  expect(harness.updater.checkForUpdates).not.toHaveBeenCalled();
});

it('keeps a provider version mismatch pending while bounded asset recovery remains', async () => {
  vi.useFakeTimers();
  const harness = createHarness({ isUpdateAvailable: false, providerVersion: '0.6.0', retryDelaysMs: [10] });

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({
    phase: 'pending-asset',
    version: '0.7.0'
  });

  expect(harness.updater.autoDownload).toBe(false);
  expect(harness.updater.autoInstallOnAppQuit).toBe(false);
  expect(harness.updater.allowDowngrade).toBe(false);
});

it('revalidates a durable downloaded candidate through the updater cache before restoring ready', async () => {
  const harness = createHarness({
    storedRecord: { checkpoint: 'downloaded', installedVersion: '0.6.0', schemaVersion: 1, targetVersion: '0.7.0' }
  });

  await expect(harness.service.check('', harness.sender as never)).resolves.toMatchObject({
    phase: 'checking', version: '0.7.0'
  });
  await vi.waitFor(() => expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(1));
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready', version: '0.7.0' }));

  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

it('clears a durable candidate written by a different installed version', async () => {
  const harness = createHarness({
    storedRecord: { checkpoint: 'downloaded', installedVersion: '0.5.0', schemaVersion: 1, targetVersion: '0.7.0' }
  });

  await harness.service.check('', harness.sender as never);

  expect(harness.stateStore.clear).toHaveBeenCalledTimes(1);
  expect(harness.service.getState()).toEqual({ phase: 'idle' });
});

it('clears a candidate when the fresh manifest reports the installed version', async () => {
  const harness = createHarness({
    storedRecord: { checkpoint: 'downloaded', installedVersion: '0.6.0', schemaVersion: 1, targetVersion: '0.7.0' }
  });

  await expect(harness.service.check('0.6.0', harness.sender as never)).resolves.toEqual({ phase: 'idle' });

  expect(harness.stateStore.clear).toHaveBeenCalledTimes(1);
});

it('exits preparation without a user-visible failure when provider recovery is exhausted', async () => {
  const harness = createHarness({ isUpdateAvailable: false });

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({
    errorCode: 'check-failed', phase: 'error', version: '0.7.0'
  });

  expect(harness.updater.downloadUpdate).not.toHaveBeenCalled();
  expect(harness.reportDiagnostic).toHaveBeenCalledWith('desktop_update_check_retry_exhausted');
});

it('downloads automatically after the provider confirms the gated release', async () => {
  const harness = createHarness();

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toMatchObject({
    phase: 'downloading',
    version: '0.7.0'
  });
  expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(1);
  harness.listeners.get('download-progress')?.({ percent: 42.3, total: 1000, transferred: 423 });
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready', version: '0.7.0' }));
});

it('keeps one target and one download when a newer manifest arrives mid-download', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);

  await expect(harness.service.check('0.8.0', harness.sender as never)).resolves.toMatchObject({
    phase: 'downloading', version: '0.7.0'
  });

  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(1);
});

it('reaches an explicit terminal state after transient download retries exhaust', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);

  harness.rejectDownload();

  await vi.waitFor(() => expect(harness.service.getState()).toEqual({
    errorCode: 'download-failed',
    phase: 'error',
    version: '0.7.0'
  }));
  expect(harness.reportDiagnostic).toHaveBeenCalledWith('desktop_update_download_transient', expect.objectContaining({
    error: expect.objectContaining({ message: 'download failed' }),
    kind: 'transient',
    stage: 'download',
    targetVersion: '0.7.0'
  }));
  expect(harness.reportDiagnostic).toHaveBeenCalledWith('desktop_update_download_retry_exhausted');
});

it('retries one transient download without creating a parallel download task', async () => {
  vi.useFakeTimers();
  const harness = createHarness({ retryDelaysMs: [10] });
  await harness.service.check('0.7.0', harness.sender as never);

  harness.rejectDownload();
  await vi.advanceTimersByTimeAsync(0);
  expect(harness.service.getState()).toEqual({
    phase: 'pending-asset', version: '0.7.0'
  });
  await vi.advanceTimersByTimeAsync(10);

  expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(2);
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready' }));
});

it('leaves checking during bounded provider recovery and preserves the original check error', async () => {
  vi.useFakeTimers();
  const harness = createHarness({ retryDelaysMs: [10] });
  const error = new Error('net::ERR_CONNECTION_RESET at /Users/private/latest-mac.yml');
  harness.updater.checkForUpdates.mockRejectedValueOnce(error);

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({
    phase: 'pending-asset', version: '0.7.0'
  });
  expect(harness.reportDiagnostic).toHaveBeenCalledWith('desktop_update_check_transient', {
    error,
    kind: 'transient',
    stage: 'check',
    targetVersion: '0.7.0'
  });

  await vi.advanceTimersByTimeAsync(10);
  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'downloading' }));
});

it('stops immediately on a structural integrity failure and sends the original error to the redacting sink', async () => {
  const harness = createHarness({ retryDelaysMs: [10] });
  await harness.service.check('0.7.0', harness.sender as never);

  harness.rejectDownload(new Error('/Users/private/update.zip sha512 checksum mismatch token=secret'));

  await vi.waitFor(() => expect(harness.service.getState()).toEqual({
    errorCode: 'download-failed', phase: 'error', version: '0.7.0'
  }));
  expect(harness.reportDiagnostic).toHaveBeenCalledWith('desktop_update_download_structural', expect.objectContaining({
    error: expect.any(Error),
    kind: 'structural',
    stage: 'download',
    targetVersion: '0.7.0'
  }));
});

it('does not download when the durable discovery record cannot be written', async () => {
  const harness = createHarness();
  harness.stateStore.write.mockRejectedValueOnce(new Error('disk full'));

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({
    errorCode: 'check-failed',
    phase: 'error',
    version: '0.7.0'
  });

  expect(harness.loadUpdater).not.toHaveBeenCalled();
});

it('does not publish ready when the downloaded checkpoint cannot be written', async () => {
  const harness = createHarness();
  harness.stateStore.write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
  await harness.service.check('0.7.0', harness.sender as never);

  harness.resolveDownload();

  await vi.waitFor(() => expect(harness.service.getState()).toEqual({
    errorCode: 'download-failed',
    phase: 'error',
    version: '0.7.0'
  }));
});

it('publishes progress and installs only after preparation succeeds', async () => {
  const harness = createHarness();
  harness.prepareInstall.mockImplementationOnce(async () => {
    expect(harness.service.getState()).toMatchObject({ phase: 'restarting', version: '0.7.0' });
    return true;
  });
  await harness.service.check('0.7.0', harness.sender as never);

  harness.listeners.get('download-progress')?.({ percent: 42.3, total: 1000, transferred: 423 });
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready', version: '0.7.0' }));
  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toMatchObject({ phase: 'ready' });
  await harness.service.install();

  expect(harness.sender.send).toHaveBeenCalledWith('foliole:desktop-update-state', expect.objectContaining({
    percent: 42.3,
    phase: 'downloading',
    totalBytes: 1000,
    transferredBytes: 423
  }));
  expect(harness.sender.send).toHaveBeenCalledWith('foliole:desktop-update-state', expect.objectContaining({
    phase: 'restarting', version: '0.7.0'
  }));
  expect(harness.prepareInstall).toHaveBeenCalledTimes(1);
  expect(harness.updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

it('blocks installation when application data cannot be flushed', async () => {
  const harness = createHarness();
  harness.prepareInstall.mockResolvedValue(false);
  await harness.service.check('0.7.0', harness.sender as never);
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready' }));

  await expect(harness.service.install()).resolves.toEqual({
    errorCode: 'install-preparation-failed',
    percent: 100,
    phase: 'ready',
    version: '0.7.0'
  });
  expect(harness.updater.quitAndInstall).not.toHaveBeenCalled();
});

it('restores the ready action when Squirrel cannot begin the restart', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready' }));

  await harness.service.install();
  harness.listeners.get('error')?.(new Error('ShipIt unavailable') as never);

  expect(harness.service.getState()).toMatchObject({
    errorCode: 'install-failed', phase: 'ready', version: '0.7.0'
  });
});
