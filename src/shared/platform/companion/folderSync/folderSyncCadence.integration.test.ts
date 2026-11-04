// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createDesktopFramedSyncFiles } from '../../../../../electron/sync/desktopFramedSyncFiles.js';
import { readFolderSyncInventory, loadFolderSyncCheckpoint } from '../../../../../lib/core/sync/folderSync/checkpoint.js';

import { createCadenceFixture, nextCompletedWrite, pauseNextObjectWrite } from './folderSyncCadence.testSupport.js';

const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime('2026-11-04T08:00:00.000Z'); });
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); vi.useRealTimers(); });
async function fixture(enabled = true) {
  const f = await createCadenceFixture(enabled);
  cleanups.push(f.close);
  return f;
}

it('does nothing by default and automatically saves after explicit enablement', async () => {
  const f = await fixture(false);
  await f.cadence.foreground();
  await f.edit('v2');
  await f.cadence.refresh('mutation');
  expect((await f.service.read()).enabled).toBe(false);
  expect((await f.service.read()).location!.completion).toBeNull();
  await expect(f.service.write()).rejects.toThrow('folder_sync_disabled');
  const completed = nextCompletedWrite(f);
  await f.service.setEnabled(true);
  await completed;
  expect((await f.service.read()).location!.completion).toMatchObject({ generation: 1 });
});

it('uses foreground, committed mutations and existing freshness opportunities while skipping background work', async () => {
  const f = await fixture();
  await f.cadence.foreground();
  expect((await f.service.read()).location!.completion!.generation).toBe(1);
  await f.cadence.foreground();
  await f.edit('v2');
  await f.cadence.refresh('mutation');
  expect((await f.service.read()).location!.completion!.generation).toBe(2);
  f.cadence.background();
  await f.edit('v3');
  await f.cadence.refresh('mutation');
  await vi.advanceTimersByTimeAsync(120_000);
  expect((await f.service.read()).location!.completion!.generation).toBe(2);
  await f.cadence.foreground();
  expect((await f.service.read()).location!.completion!.generation).toBe(3);
  await f.edit('v4');
  const completed = nextCompletedWrite(f);
  await vi.advanceTimersByTimeAsync(60_000);
  await completed;
  expect((await f.service.read()).location!.completion!.generation).toBe(4);
});

it('checks actual native foreground state before starting a round', async () => {
  const f = await fixture();
  f.setNativeActive(false);
  await f.cadence.foreground();
  expect((await f.service.read()).location!.completion).toBeNull();
  f.setNativeActive(true);
  await f.cadence.refresh('mutation');
  expect((await f.service.read()).location!.completion!.generation).toBe(1);
});

it('keeps mutations made during a manual write for one trailing round through the same service', async () => {
  const f = await fixture();
  await f.cadence.foreground();
  await f.edit('v2');
  const pause = pauseNextObjectWrite(f);
  const manual = f.service.write();
  await pause.started;
  await f.edit('v3');
  const mutation = f.cadence.refresh('mutation');
  pause.release();
  await manual;
  await mutation;
  const completed = nextCompletedWrite(f);
  await vi.advanceTimersByTimeAsync(0);
  await completed;
  const files = createDesktopFramedSyncFiles(`${f.root}/destination`);
  const checkpoint = (await loadFolderSyncCheckpoint(files, 'source'))!;
  const inventory = await readFolderSyncInventory(files, checkpoint);
  expect(inventory.find(entry => entry.globalId === 'topic')!.currentVersionId).toBe('v3');
  expect(checkpoint.generation).toBe(3);
});

it('persists failure without replacing the prior completion, then retries on existing freshness', async () => {
  const f = await fixture();
  await f.cadence.foreground();
  await f.edit('v2');
  const before = (await f.service.read()).location!.completion;
  f.native.fail(true);
  await expect(f.cadence.refresh('mutation')).rejects.toThrow('space_unavailable');
  expect((await f.service.read()).location).toMatchObject({ completion: before, failure: { sourceId: 'source' } });
  f.native.fail(false);
  const completed = nextCompletedWrite(f);
  await vi.advanceTimersByTimeAsync(60_000);
  await completed;
  expect((await f.service.read()).location).toMatchObject({ completion: { generation: 2 }, failure: null });
});

it.each(['disable', 'background', 'library'] as const)('stops an in-flight publication on %s and preserves previous output', async mode => {
  const f = await fixture();
  await f.cadence.foreground();
  await f.edit('v2');
  const before = (await f.service.read()).location!.completion;
  const pause = pauseNextObjectWrite(f);
  const running = f.cadence.refresh('mutation');
  const rejected = expect(running).rejects.toThrow(/folder_sync_(disabled|scope_changed)/u);
  await pause.started;
  if (mode === 'disable') await f.service.setEnabled(false);
  else if (mode === 'background') f.cadence.background();
  else f.cadence.invalidate();
  pause.release();
  await rejected;
  expect((await f.service.read()).location).toMatchObject({ completion: before, failure: null });
  const files = createDesktopFramedSyncFiles(`${f.root}/destination`);
  expect((await loadFolderSyncCheckpoint(files, 'source'))!.generation).toBe(1);
  await vi.advanceTimersByTimeAsync(120_000);
  expect((await f.service.read()).location!.completion).toEqual(before);
});
