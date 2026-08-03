import { afterEach, expect, it, vi } from 'vitest';

import { createDesktopUpdateServiceHarness as createHarness } from './desktopUpdateService.testSupport.js';

afterEach(() => vi.useRealTimers());

it('binds the exact target feed before first check and each transient retry', async () => {
  vi.useFakeTimers();
  const harness = createHarness({ retryDelaysMs: [10] });
  harness.updater.checkForUpdates.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_RESET'));

  await harness.service.check('0.7.0', harness.sender as never);
  expect(harness.updater.setFeedURL).toHaveBeenCalledWith(
    'https://github.com/campfirium/foliole/releases/download/v0.7.0/'
  );
  expect(harness.updater.setFeedURL.mock.invocationCallOrder[0]!)
    .toBeLessThan(harness.updater.checkForUpdates.mock.invocationCallOrder[0]!);
  await vi.advanceTimersByTimeAsync(10);
  expect(harness.updater.setFeedURL).toHaveBeenCalledTimes(2);
});

it('stops on missing channel metadata without scheduling a retry', async () => {
  vi.useFakeTimers();
  const harness = createHarness({ retryDelaysMs: [10] });
  harness.updater.checkForUpdates.mockRejectedValueOnce(Object.assign(
    new Error('latest-mac.yml is absent'), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' }
  ));

  await expect(harness.service.check('0.7.0', harness.sender as never)).resolves.toEqual({
    errorCode: 'check-failed', phase: 'error', version: '0.7.0'
  });
  await vi.advanceTimersByTimeAsync(10);
  expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(harness.updater.downloadUpdate).not.toHaveBeenCalled();
});

it('binds a persisted target before the restore check', async () => {
  const harness = createHarness({
    storedRecord: {
      checkpoint: 'downloaded', installedVersion: '0.6.0', schemaVersion: 1, targetVersion: '0.7.0'
    }
  });

  await harness.service.check('', harness.sender as never);
  await vi.waitFor(() => expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(1));
  expect(harness.updater.setFeedURL).toHaveBeenCalledWith(
    'https://github.com/campfirium/foliole/releases/download/v0.7.0/'
  );
  expect(harness.updater.setFeedURL.mock.invocationCallOrder[0]!)
    .toBeLessThan(harness.updater.checkForUpdates.mock.invocationCallOrder[0]!);
});

it('rejects an invalid manifest version before persistence or updater access', async () => {
  const harness = createHarness();

  await expect(harness.service.check('https://attacker.invalid', harness.sender as never))
    .resolves.toEqual({ phase: 'idle' });
  expect(harness.stateStore.write).not.toHaveBeenCalled();
  expect(harness.loadUpdater).not.toHaveBeenCalled();
});
