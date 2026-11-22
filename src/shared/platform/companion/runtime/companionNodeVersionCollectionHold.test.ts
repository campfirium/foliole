import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const collected: string[][] = [];
const owner = { runWriter: vi.fn(async (task: (db: unknown) => Promise<void>) => task({})) };

vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => owner }));
vi.mock('../../../../../lib/core/sync/nodeVersionPayloadCollector', () => ({
  collectNodeVersionPayloads: vi.fn(async (_db: unknown, id: string) => { collected.at(-1)!.push(id); })
}));
owner.runWriter.mockImplementation(async (task) => { collected.push([]); return task({}); });

const { holdCompanionNodeVersionCollectionDuring, scheduleCompanionNodeVersionCollection } = await import('./companionNodeHistory');

beforeEach(() => { vi.useFakeTimers(); collected.length = 0; });
afterEach(async () => { await vi.runAllTimersAsync(); vi.useRealTimers(); });

async function saveAt(ms: number, id: string, refreshMs = 500) {
  await vi.advanceTimersByTimeAsync(ms);
  let finish!: () => void;
  const held = holdCompanionNodeVersionCollectionDuring(() => new Promise<void>(resolve => { finish = resolve; }));
  scheduleCompanionNodeVersionCollection([id]);
  await vi.advanceTimersByTimeAsync(refreshMs);
  finish();
  await held;
}

it('never releases while a save and its refresh run, even when saves come as far apart as the wait', async () => {
  // Saves every 1.5 s with a 0.5 s write and refresh: the wait restarts at each save's end and never runs out.
  await saveAt(0, 'a');
  for (let i = 0; i < 4; i++) {
    await saveAt(1000, 'a');
    expect(collected).toEqual([]);
  }
  // Editing pauses: one release 1.5 s after the last save ended.
  await vi.advanceTimersByTimeAsync(1499);
  expect(collected).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(collected).toEqual([['a']]);
});

it('runs a release past the limit just after a save ends instead of inside the next one', async () => {
  // Saves every 1.5 s, each write and refresh taking 0.9 s; the seventh ends 9.9 s after the first pending save.
  await saveAt(0, 'a', 900);
  for (let i = 0; i < 6; i++) await saveAt(600, 'a', 900);
  // The limit falls inside the seventh save, so the release waits for it to end and then for the article to paint.
  expect(collected).toEqual([]);
  let finish!: () => void;
  await vi.advanceTimersByTimeAsync(299);
  expect(collected).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(collected).toEqual([['a']]);
  // A save that starts while nothing is pending is unaffected.
  const held = holdCompanionNodeVersionCollectionDuring(() => new Promise<void>(resolve => { finish = resolve; }));
  finish();
  await held;
  expect(collected).toEqual([['a']]);
});
