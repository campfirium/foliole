// @vitest-environment node
import { expect, it } from 'vitest';

import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import { moveNodes, upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { refreshDailyFlowAfterSync } from '../../lib/core/flow/dailyFlowRefresh.js';
import { commitDailyFlow, openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession.js';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { addDiveSources, createDive } from './diveRepository.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { requestNodeRound, restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const now = '2026-10-28T08:00:00.000Z';
const nextAt = '2026-10-29T08:00:00.000Z';

function seed(peer: RestorePeer, id: string, kind: 'folder' | 'topic', priority: number, parentNodeId: string | null = null) {
  const driver = createBetterSqlite3Driver(peer.sqlite);
  upsertNodeSnapshot(driver, { nodeId: id, title: id, kind, priority, parentNodeId, content: kind === 'topic' ? id : '',
    hostName: peer.id, isTitleManual: true, anchorLink: null, reveal: null, position: null, createdAt: now, updatedAt: now });
  flushNodeSyncVersionWithDriver(driver, id, peer.id, now);
}

function bindFlow(local: RestorePeer) {
  const driver = createBetterSqlite3Driver(local.sqlite);
  const settings = { scope: local.file, newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
  const persistence: DailyFlowPersistence = {
    learningSnapshot: (db, ids) => loadDailyFlowLearningSnapshot(db, local.id, ids),
    snapshot: async () => { throw new Error('Expected scoped learning facts'); },
    reading: async (_db, value, updatedAt) => { saveNodeReadingStateWithSync(driver,
      { nodeId: value.nodeId, reading: value.after, updatedAt, hostName: local.id }); },
    grade: async () => { throw new Error('Expected a reading action'); },
    reviewHistory: async () => { throw new Error('Expected a reading action'); }
  };
  const open = (args: Partial<Parameters<typeof openDailyFlow>[1]> = {}) =>
    openDailyFlow(local.db, { now, mode: 'reading-only', ...args }, settings, persistence).then(result => result.session);
  const read = (source: DailyFlowSession) => commitDailyFlow(local.db, {
    opId: `read-${source.currentNodeId}`, now, token: source.daily!, sourceSession: source, readingAction: 'read',
    readings: [{ nodeId: source.currentNodeId!, before: null, after: { nextAt, intervalDurationMs: 86400000,
      intervalGrowthFactor: 2, lastHandledAt: now, priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active' } }]
  }, settings, persistence).then(result => result.session);
  return { open, read, finishSync: () => refreshDailyFlowAfterSync(local.db, now, settings, persistence) };
}

it('uses committed local and synced membership for the next card in one open Dive', async () => {
  const fixture = await restoreFixture();
  const local = fixture.peer('source');
  const remote = fixture.peer('target');
  try {
    for (const peer of [local, remote]) {
      peer.sqlite.prepare("INSERT INTO settings VALUES ('host_name', ?, 'now')").run(peer.id);
      bindParentOrderWriter(createBetterSqlite3Driver(peer.sqlite), { deviceAnchor: peer.id, libraryPath: peer.file });
    }
    const driver = createBetterSqlite3Driver(local.sqlite);
    seed(local, 'folder', 'folder', 0);
    for (const [priority, id] of ['global', 'joined', 'moved', 'remote', 'current', 'removed'].entries()) {
      seed(local, id, 'topic', 9 - priority);
    }
    const { open, read, finishSync } = bindFlow(local);
    const global = await open();
    const [, joinedId, receivedId, movedId, currentId, removedId] = (await readCycleRows(local.db)).map(row => row.node_id) as
      [string, string, string, string, string, string];
    const dive = createDive(local.sqlite, 'Live scope', [currentId, removedId, 'folder']);
    const overlapping = createDive(local.sqlite, 'Shared facts', [currentId, receivedId]);
    const current = await open({ dive: { id: dive.id, topicIds: [currentId, removedId] } });
    expect(current.currentNodeId).toBe(currentId);
    const createdAt = local.sqlite.prepare('SELECT created_at FROM nodes WHERE id = ?').pluck().get(dive.id) as string;
    upsertNodeSnapshot(driver, { nodeId: dive.id, title: dive.title, kind: 'folder', parentNodeId: null,
      hostName: local.id, isTitleManual: true, anchorLink: null, reveal: null, position: null, content: '',
      virtualFilter: DIVE_NODE_FILTER, manualChildOrder: ['folder'], createdAt, updatedAt: new Date().toISOString() });
    flushNodeSyncVersionWithDriver(driver, dive.id, local.id, new Date().toISOString());
    addDiveSources(local.sqlite, dive.id, [joinedId]);
    const joined = await read(current);
    expect(joined.currentNodeId).toBe(joinedId);
    expect(joined.dive?.position).toBeLessThan(current.dive!.position);

    const rootIds = readMoveParentOrder(driver, null).visibleIds;
    moveNodes(driver, { maintainSequentialReading: false, defaultPriority: 5,
      nodes: [{ nodeId: movedId, expectedParentNodeId: null, parentNodeId: 'folder', updatedAt: now }],
      parentOrders: [{ parentNodeId: null, expectedChildIds: rootIds, childIds: rootIds.filter(id => id !== movedId) },
        { parentNodeId: 'folder', expectedChildIds: [], childIds: [movedId] }] });
    flushNodeSyncVersionWithDriver(driver, movedId, local.id, new Date().toISOString());
    const moved = await read(joined);
    expect(moved.currentNodeId).toBe(movedId);

    expect(await requestNodeRound(local, remote)).toMatchObject({ complete: true, pending: 0 });
    addDiveSources(remote.sqlite, dive.id, [receivedId]);
    expect(await requestNodeRound(remote, local)).toMatchObject({ complete: true, pending: 0 });
    await finishSync();
    const received = await read(moved);
    expect(received.currentNodeId).toBe(receivedId);
    expect(received.dive?.position).toBeLessThan(moved.dive!.position);
    expect(received.dive?.limit).toBe(current.dive?.limit);
    const stop = await read(received);
    expect(stop).toMatchObject({ currentNodeId: null, dive: { phase: 'initial', stop: 'finished' } });
    const switched = await open({ seed: stop, dive: { id: overlapping.id, topicIds: [currentId, receivedId] } });
    expect(switched).toMatchObject({ currentNodeId: null, dive: { stop: 'empty' } });
    expect((await readDailyFlow(local.db))?.session.cycle?.scanAfter).toBe(global.cycle?.scanAfter);
    expect((await open({ returnFromDive: true })).currentNodeId).toBe(global.currentNodeId);
    local.reopen();
    expect(local.sqlite.prepare('SELECT node_id, repetition_count FROM node_reading ORDER BY node_id').all()).toEqual(
      [currentId, joinedId, movedId, receivedId].sort().map(node_id => ({ node_id, repetition_count: 1 })));
  } finally { await fixture.close(); }
});

it('finishes an open Dive card when the same sync also adds unrelated daily work', async () => {
  const fixture = await restoreFixture();
  const local = fixture.peer('source');
  const remote = fixture.peer('target');
  try {
    for (const peer of [local, remote]) {
      peer.sqlite.prepare("INSERT INTO settings VALUES ('host_name', ?, 'now')").run(peer.id);
      bindParentOrderWriter(createBetterSqlite3Driver(peer.sqlite), { deviceAnchor: peer.id, libraryPath: peer.file });
    }
    for (const [priority, id] of ['global', 'join', 'current', 'remaining'].entries()) seed(local, id, 'topic', priority);
    const { open, read, finishSync } = bindFlow(local);
    const global = await open();
    const [, joinedId, currentId, remainingId] = (await readCycleRows(local.db)).map(row => row.node_id) as
      [string, string, string, string];
    const dive = createDive(local.sqlite, 'Open during refresh', [currentId, remainingId]);
    const scope = { id: dive.id, topicIds: [currentId, remainingId] };
    const current = await open({ dive: scope });
    expect(current.currentNodeId).toBe(currentId);
    expect(await requestNodeRound(local, remote)).toMatchObject({ complete: true, pending: 0 });

    addDiveSources(remote.sqlite, dive.id, [joinedId]);
    seed(remote, 'unrelated-new', 'topic', 5);
    expect(await requestNodeRound(remote, local)).toMatchObject({ complete: true, pending: 0 });
    expect(await finishSync()).toBe(true);
    expect((await open({ seed: current, dive: scope })).currentNodeId).toBe(currentId);
    const joined = await read(current);
    expect(joined.currentNodeId).toBe(joinedId);
    const remaining = await read(joined);
    expect(remaining.currentNodeId).toBe(remainingId);
    expect(await read(remaining)).toMatchObject({ currentNodeId: null, dive: { stop: 'finished' } });
    const resumed = await open({ returnFromDive: true });
    expect(resumed.currentNodeId).toBe(global.currentNodeId);
    expect((await read(resumed)).currentNodeId).toBe('unrelated-new');
    local.reopen();
    expect(local.sqlite.prepare('SELECT node_id, repetition_count FROM node_reading ORDER BY node_id').all()).toEqual(
      [global.currentNodeId, currentId, joinedId, remainingId].sort().map(node_id => ({ node_id, repetition_count: 1 })));
  } finally { await fixture.close(); }
});
