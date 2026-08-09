import { expect, it, vi } from 'vitest';

import { runDesktopSyncGroupPeerSingleFlight } from './desktopSyncGroupPeerSingleFlight.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it('shares one active sync for the same peer and releases it after settlement', async () => {
  const firstResult = deferred<number>();
  const execute = vi.fn(() => firstResult.promise);
  const first = runDesktopSyncGroupPeerSingleFlight('android-b', execute);
  const duplicate = runDesktopSyncGroupPeerSingleFlight('android-b', execute);

  expect(execute).toHaveBeenCalledOnce();
  firstResult.resolve(9);
  await expect(Promise.all([first, duplicate])).resolves.toEqual([9, 9]);

  await expect(runDesktopSyncGroupPeerSingleFlight('android-b', async () => 10)).resolves.toBe(10);
});

it('does not serialize syncs for different peers', async () => {
  const executeA = vi.fn(async () => 'a');
  const executeB = vi.fn(async () => 'b');
  await expect(Promise.all([
    runDesktopSyncGroupPeerSingleFlight('android-a', executeA),
    runDesktopSyncGroupPeerSingleFlight('android-b', executeB)
  ])).resolves.toEqual(['a', 'b']);
  expect(executeA).toHaveBeenCalledOnce();
  expect(executeB).toHaveBeenCalledOnce();
});
