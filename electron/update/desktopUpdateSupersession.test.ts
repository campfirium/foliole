import { expect, it, vi } from 'vitest';

import { createDesktopUpdateServiceHarness as createHarness } from './desktopUpdateService.testSupport.js';

it('persists a newer target and serially replaces an in-progress download', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);
  harness.updater.checkForUpdates.mockResolvedValue({
    isUpdateAvailable: true,
    updateInfo: { version: '0.8.0' }
  });

  await expect(harness.service.check('0.8.0', harness.sender as never)).resolves.toMatchObject({
    phase: 'pending-asset', version: '0.8.0'
  });
  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(1);
  expect(harness.stateStore.write).toHaveBeenLastCalledWith({
    checkpoint: 'discovered',
    installedVersion: '0.6.0',
    schemaVersion: 1,
    targetVersion: '0.8.0'
  });

  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(2));
  expect(harness.updater.setFeedURL).toHaveBeenLastCalledWith(
    'https://github.com/campfirium/foliole/releases/download/v0.8.0/'
  );
  expect(harness.service.getState()).toMatchObject({ phase: 'downloading', version: '0.8.0' });
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready', version: '0.8.0' }));
});

it('starts the newer target when the old download finishes during target persistence', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);
  let releaseWrite: (() => void) | undefined;
  harness.stateStore.write.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
    releaseWrite = () => resolve(undefined);
  }));
  harness.updater.checkForUpdates.mockResolvedValue({
    isUpdateAvailable: true,
    updateInfo: { version: '0.8.0' }
  });

  const supersedingCheck = harness.service.check('0.8.0', harness.sender as never);
  await vi.waitFor(() => expect(harness.stateStore.write).toHaveBeenCalledTimes(2));
  harness.resolveDownload();
  releaseWrite?.();
  await supersedingCheck;

  await vi.waitFor(() => expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(2));
  expect(harness.service.getState()).toMatchObject({ phase: 'downloading', version: '0.8.0' });
});

it('replaces a downloaded candidate without installing skipped releases', async () => {
  const harness = createHarness();
  await harness.service.check('0.7.0', harness.sender as never);
  harness.resolveDownload();
  await vi.waitFor(() => expect(harness.service.getState()).toMatchObject({ phase: 'ready', version: '0.7.0' }));
  harness.updater.checkForUpdates.mockResolvedValue({
    isUpdateAvailable: true,
    updateInfo: { version: '0.9.0' }
  });

  await expect(harness.service.check('0.9.0', harness.sender as never)).resolves.toMatchObject({
    phase: 'downloading', version: '0.9.0'
  });
  expect(harness.updater.quitAndInstall).not.toHaveBeenCalled();
  expect(harness.updater.downloadUpdate).toHaveBeenCalledTimes(2);
});

it('ignores stale targets after a newer candidate is active', async () => {
  const harness = createHarness({ providerVersion: '0.9.0' });
  await harness.service.check('0.9.0', harness.sender as never);

  await expect(harness.service.check('0.8.0', harness.sender as never)).resolves.toMatchObject({
    phase: 'downloading', version: '0.9.0'
  });
  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

it('can retry a target after its durable discovery write fails', async () => {
  const harness = createHarness();
  harness.stateStore.write.mockRejectedValueOnce(new Error('disk full'));

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toMatchObject({
    errorCode: 'check-failed', phase: 'error', version: '0.7.0'
  });
  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toMatchObject({
    phase: 'downloading', version: '0.7.0'
  });
});

it('supersedes a restored older candidate with the latest manifest target', async () => {
  const harness = createHarness({
    providerVersion: '0.9.0',
    storedRecord: { checkpoint: 'downloaded', installedVersion: '0.6.0', schemaVersion: 1, targetVersion: '0.7.0' }
  });

  await harness.service.check('', harness.sender as never);
  await expect(harness.service.check('0.9.0', harness.sender as never)).resolves.toMatchObject({
    phase: 'downloading', version: '0.9.0'
  });
  expect(harness.stateStore.write).toHaveBeenLastCalledWith(expect.objectContaining({ targetVersion: '0.9.0' }));
  expect(harness.updater.setFeedURL).toHaveBeenLastCalledWith(
    'https://github.com/campfirium/foliole/releases/download/v0.9.0/'
  );
});
