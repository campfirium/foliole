// @vitest-environment node
import { expect, it } from 'vitest';

import { hashTextBody, hashTextBodyAsync } from '../database/textBodyHash.js';

import type { DailyFlowSession } from './dailyFlowSession.js';
import { compactFlowHistoryEntry } from './flowHistoryEntry.js';
import { compactFlowHistoryEntryAsync, restoreFlowHistoryEntryAsync } from './flowHistoryEntryAsync.js';
import { compactFlowHistorySessions, restoreFlowHistorySession } from './flowHistorySession.js';
import { compactFlowHistorySessionsAsync, restoreFlowHistorySessionAsync } from './flowHistorySessionAsync.js';

const session = (queue: string[], soon: string[] = []): DailyFlowSession => ({ currentNodeId: queue[0] ?? null,
  queueNodeIds: queue, soonNodeIds: soon, totalNodeCount: queue.length, isAnswerRevealed: false });

it.each(['', 'Exact ASCII', '中文🍃\ud800', 'x'.repeat(16383) + '🍃\udfff'])('keeps native SHA-256 identical to the synchronous UTF-8 digest', async text => {
  expect(await hashTextBodyAsync(text)).toBe(hashTextBody(text));
});

it.each([
  [['a', 'b', 'c'], ['b', 'c'], [], ['a']],
  [['a', 'b', 'c'], ['c', 'a'], ['d'], ['d', 'e']],
  [[], ['a'], ['b'], []]
])('preserves the exact history encoding and verifies both restoration directions', async (bq, aq, bs, as) => {
  const before = session(bq, bs);
  const after = session(aq, as);
  const pair = await compactFlowHistorySessionsAsync(before, after);
  expect(pair).toEqual(compactFlowHistorySessions(before, after));
  expect(await restoreFlowHistorySessionAsync(pair.before, after)).toEqual(before);
  expect(await restoreFlowHistorySessionAsync(pair.after, before)).toEqual(after);
  expect(await restoreFlowHistorySessionAsync(pair.after, after)).toEqual(after);
  expect(await compactFlowHistorySessionsAsync(pair.before, pair.after)).toEqual(pair);
});

it('preserves full large entries and rejects altered source or delta without modifying input facts', async () => {
  const before = session(Array.from({ length: 10000 }, (_, index) => `node-${index}`));
  const after = session(before.queueNodeIds.slice(1), [before.currentNodeId!]);
  const entry = { beforeContext: { reviewSession: before, retained: 'before' },
    afterContext: { reviewSession: after, retained: 'after' }, extra: 'keep' };
  const compact = await compactFlowHistoryEntryAsync(entry);
  expect(compact).toEqual(compactFlowHistoryEntry(entry));
  expect(await restoreFlowHistoryEntryAsync(compact, after)).toEqual(entry);
  const pair = await compactFlowHistorySessionsAsync(before, after);
  await expect(restoreFlowHistorySessionAsync(pair.before, session(['changed']))).rejects.toThrow('flow_history_changed');
  pair.before.queueHistory!.queue.removed[0]!.id = 'wrong';
  await expect(restoreFlowHistorySessionAsync(pair.before, after)).rejects.toThrow('flow_history_invalid_delta');
  expect(restoreFlowHistorySession(compact.beforeContext.reviewSession, after)).toEqual(before);
  expect(after.queueNodeIds).toEqual(before.queueNodeIds.slice(1));
});

it('captures queue and delta facts before awaiting the native digest', async () => {
  const before = session(['a', 'b', 'c']);
  const after = session(['b', 'c'], ['a']);
  const pending = compactFlowHistorySessionsAsync(before, after);
  before.queueNodeIds.push('later');
  const pair = await pending;
  const current = session(['a', 'b', 'c']);
  const restored = restoreFlowHistorySessionAsync(pair.after, current);
  current.queueNodeIds.push('changed');
  pair.after.queueHistory!.queue.after = 'changed';
  expect(await restored).toEqual(after);
});

it('preserves node-change session fields and unrelated entry metadata', async () => {
  const before = session(['a', 'b']);
  const after = session(['b']);
  const entry = { type: 'nodes.change', beforeSession: before, afterSession: after, extra: 'keep' };
  const compact = await compactFlowHistoryEntryAsync(entry);
  expect(compact).toEqual(compactFlowHistoryEntry(entry));
  expect(await restoreFlowHistoryEntryAsync(compact, before)).toEqual(entry);
});

it('captures entry metadata before awaiting fingerprint work', async () => {
  const entry = { beforeSession: session(['a', 'b']), afterSession: session(['b']), extra: 'before' };
  const pending = compactFlowHistoryEntryAsync(entry);
  entry.extra = 'later';
  expect((await pending).extra).toBe('before');
});
