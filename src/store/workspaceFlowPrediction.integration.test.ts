// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { withRequestSyncReadonlySnapshot } from '../../electron/database/requestSyncReadonlySnapshot';
import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { loadWorkspaceNodeDocument } from '../../lib/core/database/workspaceNodeDocument';
import { predictDailyFlowDocument } from '../../lib/core/flow/dailyFlowPrediction';
import { commitDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, assertDurable, node, now, open, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); peer.db.pragma('journal_mode = WAL'); });
afterEach(async () => { vi.restoreAllMocks(); await closeLibraries(); });

it('commits and resumes the next item even when preparing its successor would fail', async () => {
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  const initial = await open(peer, now, settings(peer), 'reading-only');
  const rows = peer.db.prepare('SELECT node_id FROM daily_flow_entries ORDER BY order_key').all() as { node_id: string }[];
  const next = rows[1]!.node_id;
  const query = peer.port.query.bind(peer.port);
  // Keep the real current selection and all writes; only future qualification is unavailable.
  vi.spyOn(peer.port, 'query').mockImplementation((sql, params) => {
    if (sql.includes('order_key > ?') && params?.[0] === 2) throw new Error('future preparation unavailable');
    return query(sql, params);
  });
  const committed = await act(peer, initial, 'soon');
  expect(committed.currentNodeId).toBe(next);
  expect(loadWorkspaceNodeDocument(peer.driver, next)?.content).toBe(`Body ${next}`);
  await assertDurable(peer, committed);
  expect((await open(peer, now, settings(peer), 'reading-only')).currentNodeId).toBe(next);
  vi.restoreAllMocks();
  const following = await act(peer, committed, 'soon');
  expect(following.currentNodeId).toBe(rows[2]!.node_id);
  await assertDurable(peer, following);
});

it('does not let a pending readonly prediction delay a new action or mutate durable scheduling', async () => {
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  const first = await open(peer, now, settings(peer), 'reading-only');
  const before = peer.db.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const pending = withRequestSyncReadonlySnapshot(peer.file, async db => {
    const query = db.query.bind(db);
    return predictDailyFlowDocument({ ...db, async query(sql, params) {
      if (sql.includes('order_key > ?')) { entered(); await held; }
      return query(sql, params);
    } }, { token: first.daily!, currentNodeId: first.currentNodeId!, now }, settings(peer), persistence);
  });
  await started;
  let second;
  try {
    second = await act(peer, first, 'soon');
    await assertDurable(peer, second);
    expect(second.currentNodeId).not.toBe(first.currentNodeId);
  } finally { release(); }
  expect(await pending).toBe(second.currentNodeId);
  expect((await readDailyFlow(peer.port))?.session).toEqual(second);
  expect(peer.db.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).not.toEqual(before);
  const currentRows = peer.db.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all();
  expect(await withRequestSyncReadonlySnapshot(peer.file, db => predictDailyFlowDocument(db,
    { token: first.daily!, currentNodeId: first.currentNodeId!, now }, settings(peer), persistence))).toBeNull();
  expect(peer.db.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).toEqual(currentRows);
});

it('replays a lost acknowledgement without preparing another item and rejects stale scope predictions', async () => {
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  const first = await open(peer, now, settings(peer), 'reading-only');
  const data = await snapshot(peer);
  const reading = data.nodesById[first.currentNodeId!]!.reading;
  const args = { opId: 'lost-ack', now, token: first.daily!, sourceSession: first, readingAction: 'soon' as const,
    readings: [{ nodeId: first.currentNodeId!, before: reading, after: reading }] };
  const saved = await commitDailyFlow(peer.port, args, settings(peer), persistence);
  const retry = await commitDailyFlow(peer.port, args, settings(peer), persistence);
  expect(retry.replayed).toBe(true);
  expect(retry.session).toEqual(saved.session);
  const predict = (scope: string) => withRequestSyncReadonlySnapshot(peer.file, db => predictDailyFlowDocument(db,
    { token: { ...saved.session.daily!, scope }, currentNodeId: saved.session.currentNodeId!, now }, settings(peer), persistence));
  expect(await predict('other-library')).toBeNull();
  expect(await predict(saved.session.daily!.scope)).toBeTruthy();
  await assertDurable(peer, saved.session);
});
