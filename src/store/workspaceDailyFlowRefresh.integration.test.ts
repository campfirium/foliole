// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { score } from '../../electron/database/reviewProjection.testSupport';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState';
import { refreshDailyFlowAfterSync } from '../../lib/core/flow/dailyFlowRefresh';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, exchange, node, now, open, persistence, publish, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';
import { historyEntry, replayHistory } from '../test/dailyFlowHistorySync.testSupport';

afterEach(closeLibraries);
const stamp = '2026-10-26T08:02:00.000Z';

it('rebuilds after real peer additions, preserves the displayed action, and skips identical membership', async () => {
  const [a, b] = await setupPeers();
  node(a, 'first', 'topic');
  node(a, 'second', 'topic');
  await exchange(a, b);
  const displayed = await open(b);
  node(a, 'new', 'topic');
  await exchange(a, b);
  expect(await refreshDailyFlowAfterSync(b.port, stamp, settings(b), persistence)).toBe(true);
  const saved = (await readDailyFlow(b.port))!;
  expect(saved.session.currentNodeId).toBe(displayed.currentNodeId);
  expect(saved.session.cycle!.remaining).toBe(displayed.cycle!.remaining + 1);
  expect((await readCycleRows(b.port)).map(row => row.node_id)).toContain('new');
  const reader = new Database(b.file, { readonly: true });
  try { expect(reader.prepare("SELECT node_id FROM daily_flow_entries WHERE node_id='new'").get()).toBeTruthy(); }
  finally { reader.close(); }
  expect(await refreshDailyFlowAfterSync(b.port, stamp, settings(b), persistence)).toBe(false);
  expect(await readDailyFlow(b.port)).toEqual(saved);
  // A click already in flight before the rebuild still commits against the same displayed learning facts.
  const advanced = await act(b, displayed, 'read', stamp);
  expect(advanced.readTopicCount).toBe(1);
  expect(advanced.currentNodeId).not.toBe(displayed.currentNodeId);
  const next = advanced.currentNodeId === 'new' ? advanced : await act(b, advanced, 'read', stamp);
  expect(next.currentNodeId).toBe('new');
});

it.each(['body', 'priority'] as const)('does not create a list before entry and ignores %s-only changes after entry', async change => {
  const [a, b] = await setupPeers();
  node(a, 'first', 'topic');
  await exchange(a, b);
  expect(await refreshDailyFlowAfterSync(b.port, now, settings(b), persistence)).toBe(false);
  expect(await readDailyFlow(b.port)).toBeNull();
  await open(b);
  const before = await readDailyFlow(b.port);
  upsertNodeSnapshot(a.driver, { nodeId: 'first', kind: 'topic', parentNodeId: null, title: 'first',
    content: change === 'body' ? 'Updated body' : 'Body first', priority: change === 'priority' ? 2 : null,
    reveal: null, anchorLink: null, isTitleManual: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: stamp, position: null, hostName: a.name });
  publish(a, 'first', stamp);
  await exchange(a, b);
  expect(await refreshDailyFlowAfterSync(b.port, now, settings(b), persistence)).toBe(false);
  expect(await readDailyFlow(b.port)).toEqual(before);
});

it('keeps real completed facts and Soon and supports targeted undo after rebuilding', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['first', 'second', 'third']) node(a, id, 'topic');
  await exchange(a, b);
  const initial = await open(b);
  const entry = await historyEntry(b, initial.currentNodeId!, 'read', '2026-10-26T08:01:00.000Z');
  const read = (await readDailyFlow(b.port))!.session;
  const soon = await act(b, read, 'soon', stamp);
  const oldSoon = (await readCycleRows(b.port)).find(row => row.cohort === 'soon')!;
  node(a, 'new', 'topic');
  await exchange(a, b);
  await refreshDailyFlowAfterSync(b.port, stamp, settings(b), persistence);
  const after = (await readDailyFlow(b.port))!.session;
  expect(after.currentNodeId).toBe(soon.currentNodeId);
  expect(after.readTopicCount).toBe(soon.readTopicCount);
  expect((await readCycleRows(b.port)).find(row => row.node_id === oldSoon.node_id))
    .toMatchObject({ cohort: 'soon', handled: 1, initial_task: 0 });
  expect((await readCycleRows(b.port)).find(row => row.node_id === initial.currentNodeId))
    .toMatchObject({ handled: 1, initial_task: 0 });
  const undone = await replayHistory(b, after, entry, 'undo', '2026-10-26T08:03:00.000Z');
  await replayHistory(b, undone.session, entry, 'redo', '2026-10-26T08:04:00.000Z');
  expect((await readCycleRows(b.port)).some(row => row.node_id === 'new')).toBe(true);
});

it('rolls back a failed replacement without losing the original list or progress', async () => {
  const [a, b] = await setupPeers();
  node(a, 'first', 'topic');
  await exchange(a, b);
  await open(b);
  node(a, 'new', 'topic');
  await exchange(a, b);
  const state = await readDailyFlow(b.port);
  const rows = await readCycleRows(b.port);
  b.db.exec("CREATE TRIGGER reject_refresh BEFORE INSERT ON daily_flow_entries WHEN NEW.node_id='new' BEGIN SELECT RAISE(ABORT,'refresh_interrupted'); END");
  await expect(refreshDailyFlowAfterSync(b.port, now, settings(b), persistence)).rejects.toThrow('refresh_interrupted');
  expect(await readDailyFlow(b.port)).toEqual(state);
  expect(await readCycleRows(b.port)).toEqual(rows);
});

it('skips a future peer item and rebuilds when its real synchronized review becomes due today', async () => {
  const [a, b] = await setupPeers();
  node(a, 'first', 'topic');
  await exchange(a, b);
  await open(b);
  node(a, 'future', 'item');
  score({ sqlite: a.db, id: a.name }, 'future-score', now, 4, 'future');
  await exchange(a, b);
  expect(await refreshDailyFlowAfterSync(b.port, now, settings(b), persistence)).toBe(false);
  expect((await readCycleRows(b.port)).some(row => row.node_id === 'future')).toBe(false);
  saveNodeReviewStateWithSync(a.driver, { nodeId: 'future', review: null, history: { mode: 'undo', targetOpId: 'future-score' },
    hostName: a.name, updatedAt: stamp });
  await exchange(a, b);
  expect(await refreshDailyFlowAfterSync(b.port, stamp, settings(b), persistence)).toBe(true);
  expect((await readCycleRows(b.port)).some(row => row.node_id === 'future')).toBe(true);
});

it.each(['reading-only', 'review-first'] as const)('keeps %s while rebuilding after a peer addition', async mode => {
  const [a, b] = await setupPeers();
  const kind = mode === 'reading-only' ? 'topic' : 'item';
  node(a, 'first', kind);
  await exchange(a, b);
  const displayed = (await openDailyFlow(b.port, { now, mode }, settings(b), persistence)).session;
  node(a, 'new', kind);
  await exchange(a, b);
  expect(await refreshDailyFlowAfterSync(b.port, stamp, settings(b), persistence)).toBe(true);
  expect((await readDailyFlow(b.port))!.mode).toBe(mode);
  expect((await readDailyFlow(b.port))!.session.currentNodeId).toBe(displayed.currentNodeId);
  expect((await readCycleRows(b.port)).some(row => row.node_id === 'new')).toBe(true);
  const advanced = await act(b, displayed, mode === 'review-first' ? 'grade' : 'read', stamp);
  expect(advanced.currentNodeId).not.toBe(displayed.currentNodeId);
});

it('adds a missing installed-list baseline without rebuilding or clearing pending validation', async () => {
  const [a, b] = await setupPeers();
  node(a, 'first', 'topic');
  await exchange(a, b);
  await open(b);
  const stored = (await readDailyFlow(b.port))!;
  const legacy = { ...stored.session, daily: undefined };
  delete legacy.candidateMembershipHash;
  b.db.prepare('UPDATE daily_flow_state SET session_json=?,invalidated=1').run(JSON.stringify(legacy));
  const rows = await readCycleRows(b.port);
  expect(await refreshDailyFlowAfterSync(b.port, now, settings(b), persistence)).toBe(false);
  const after = (await readDailyFlow(b.port))!;
  expect(after.revision).toBe(stored.revision);
  expect(after.invalidated).toBe(1);
  expect(after.session.currentNodeId).toBe(stored.session.currentNodeId);
  expect(after.session.candidateMembershipHash).toBeTruthy();
  expect(await readCycleRows(b.port)).toEqual(rows);
});
