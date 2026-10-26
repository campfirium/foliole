import { expect, it } from 'vitest';

import type { DailyFlowSession } from './dailyFlowSession.js';
import { compactFlowHistorySessions, matchesFlowHistoryQueues, restoreFlowHistorySession } from './flowHistorySession.js';

const session = (queueNodeIds: string[], soonNodeIds: string[] = []): DailyFlowSession => ({
  currentNodeId: queueNodeIds[0] ?? null, queueNodeIds, soonNodeIds, totalNodeCount: queueNodeIds.length,
  isAnswerRevealed: false });

it('stores a reversible single consumption without retaining the untouched daily list', () => {
  const before = session(Array.from({ length: 10000 }, (_, i) => `node-${i}`));
  const after = session(before.queueNodeIds.slice(1));
  const compact = compactFlowHistorySessions(before, after);
  expect(JSON.stringify(compact).length).toBeLessThan(1800);
  expect(JSON.stringify(compact)).not.toContain('node-9999');
  expect(matchesFlowHistoryQueues(compact.after, after)).toBe(true);
  expect(restoreFlowHistorySession(compact.before, after)).toEqual(before);
  expect(restoreFlowHistorySession(compact.after, before)).toEqual(after);
});

it.each([
  [['a', 'b', 'c'], ['b', 'c'], [], ['a']],
  [['a', 'b', 'c'], ['a', 'c', 'b'], ['d'], ['d', 'e']],
  [[], ['a'], ['b', 'c'], ['c']],
  [['a'], [], [], []]
])('restores queue and Soon changes in both directions', (bq, aq, bs, as) => {
  const before = session(bq, bs);
  const after = session(aq, as);
  const pair = compactFlowHistorySessions(before, after);
  expect(restoreFlowHistorySession(pair.before, after)).toEqual(before);
  expect(restoreFlowHistorySession(pair.after, before)).toEqual(after);
  expect(restoreFlowHistorySession(pair.after, after)).toEqual(after);
  expect(matchesFlowHistoryQueues(pair.before, after)).toBe(false);
});

it('rejects changed source lists and corrupt increments without installing an old list', () => {
  const before = session(['a', 'b', 'c']);
  const after = session(['b', 'c']);
  const pair = compactFlowHistorySessions(before, after);
  expect(() => restoreFlowHistorySession(pair.before, session(['b', 'new']))).toThrow('flow_history_changed');
  pair.before.queueHistory!.queue.removed = [{ index: 0, id: 'wrong' }];
  expect(() => restoreFlowHistorySession(pair.before, after)).toThrow('flow_history_invalid_delta');
  expect(after.queueNodeIds).toEqual(['b', 'c']);
});

it('keeps distant related removals local instead of copying untouched entries between them', () => {
  const before = session(Array.from({ length: 10000 }, (_, i) => `node-${i}`));
  const after = session(before.queueNodeIds.filter(id => id !== 'node-1' && id !== 'node-9998'));
  const pair = compactFlowHistorySessions(before, after);
  expect(JSON.stringify(pair)).not.toContain('node-5000');
  expect(JSON.stringify(pair).length).toBeLessThan(2000);
  expect(restoreFlowHistorySession(pair.before, after)).toEqual(before);
});
