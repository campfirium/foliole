// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { score } from '../../electron/database/reviewProjection.testSupport';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState';
import { act, exchange, node, open, readView, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it('evaluates timed reading against each local day interval', async () => {
  const [a, b] = await setupPeers();
  node(a, 'waiting', 'topic');
  saveNodeReadingStateWithSync(a.driver, { nodeId: 'waiting', hostName: a.name,
    updatedAt: '2026-10-26T09:00:00.000Z', reading: { intervalDurationMs: 22 * 3_600_000,
      intervalGrowthFactor: 1, lastHandledAt: '2026-10-26T09:00:00.000Z', nextAt: '2026-10-27T07:00:00.000Z',
      priority: 0, readingPosition: 0, repetitionCount: 1, state: 'active' } });
  const dayWindow = { start: '2026-10-26T08:00:00.000Z', end: '2026-10-27T08:00:00.000Z' };
  const before = await open(a, '2026-10-26T21:00:00.000Z', { ...settings(a), dayWindow });
  expect(before.currentNodeId).toBeNull();
  await exchange(a, b);
  const receivingSettings = { ...settings(b), dayWindow: {
    start: '2026-10-26T20:00:00.000Z', end: '2026-10-27T20:00:00.000Z' } };
  expect((await open(b, '2026-10-26T21:00:00.000Z', receivingSettings)).currentNodeId).toBe('waiting');
  expect((await open(a, '2026-10-27T07:00:00.000Z')).currentNodeId).toBe('waiting');
  expect((await open(b, '2026-10-27T07:00:00.000Z')).currentNodeId).toBe('waiting');
  expect(await readView(a, '2026-10-27T07:00:00.000Z')).toEqual(await readView(b, '2026-10-27T07:00:00.000Z'));
});

it('retains local review day boundaries while sharing the subsequent rating', async () => {
  const [a, b] = await setupPeers();
  node(a, 'scheduled', 'item');
  score({ sqlite: a.db, id: a.name }, 'earlier-review', '2026-10-22T15:00:00.000Z', 3, 'scheduled');
  const card = a.db.prepare("SELECT due, scheduled_days FROM node_review WHERE node_id='scheduled'").get() as { due: string; scheduled_days: number };
  expect(card.scheduled_days).toBeGreaterThanOrEqual(1);
  const dayWindow = { start: new Date(Date.parse(card.due) - 20 * 3_600_000).toISOString(),
    end: new Date(Date.parse(card.due) + 4 * 3_600_000).toISOString() };
  const at = new Date(Date.parse(dayWindow.start) + 30 * 60_000).toISOString();
  const before = await open(a, at, { ...settings(a), dayWindow });
  expect(before.currentNodeId).toBe('scheduled');
  await exchange(a, b);
  const received = await open(b, at);
  expect(received.currentNodeId).toBeNull();
  expect(received.dayWindow).not.toEqual(before.dayWindow);
  await act(a, before, 'grade', at);
  await exchange(b, a);
  expect(a.db.prepare('SELECT COUNT(*) AS total FROM review_log').get()).toEqual({ total: 2 });
});
