// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { flushCurrentParentOrderProjections } from '../../lib/core/database/currentParentOrderStore';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { exchangeBodySyncOverHttp } from '../test/bodySyncHttp.testSupport';
import { act, node, now, open, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it('keeps the saved local sequence through local saves, real HTTP body sync, duplicate delivery and restart', async () => {
  const [source, target] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(source, id, 'topic');
  await exchangeBodySyncOverHttp(source, target);
  const sessions = await Promise.all([open(source), open(target)]);
  const rows = await Promise.all([readCycleRows(source.port), readCycleRows(target.port)]);
  const id = sessions[1]!.currentNodeId!;
  const reading = (await snapshot(source)).nodesById[id]!.reading;
  for (const peer of [source, target]) flushCurrentParentOrderProjections(peer.driver);
  for (const content of ['Edited body', 'Edited body', '']) {
    upsertNodeSnapshot(source.driver, { nodeId: id, kind: 'topic', title: id, content,
      parentNodeId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now,
      isTitleManual: true, anchorLink: null, reveal: null, position: null, reading });
    flushNodeSyncVersionWithDriver(source.driver, id, source.name, now);
    expect((await readDailyFlow(source.port))!.invalidated).toBe(0);
    await exchangeBodySyncOverHttp(source, target);
    for (const [index, peer] of [source, target].entries()) {
      expect(peer.db.prepare('SELECT content FROM nodes WHERE id=?').pluck().get(id)).toBe(content);
      expect(peer.db.prepare('SELECT * FROM parent_order_projection_pending').all()).toEqual([]);
      expect((await readDailyFlow(peer.port))!.invalidated).toBe(0);
      expect(await readCycleRows(peer.port)).toEqual(rows[index]);
      const reader = new Database(peer.file);
      try {
        const stored = await openDailyFlow(createBetterSqliteDbPort(reader), { now, mode: 'recommended', preserveCurrent: true }, settings(peer), persistence);
        expect(stored.session.currentNodeId).toBe(sessions[index]!.currentNodeId);
        expect(stored.session.cycle).toEqual(sessions[index]!.cycle);
      } finally { reader.close(); }
    }
  }
  await exchangeBodySyncOverHttp(source, target);
  expect(await readCycleRows(target.port)).toEqual(rows[1]);
});

it('does not rebuild the saved sequence for material insertion, removal, or empty body changes', async () => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  let session = await open(peer);
  const rows = await readCycleRows(peer.port);
  const next = rows.find(row => row.node_id !== session.currentNodeId)!.node_id;
  peer.db.prepare("UPDATE nodes SET content='', body_blob_hash=NULL WHERE id=?").run(next);
  node(peer, 'new', 'topic');
  peer.db.prepare("UPDATE nodes SET deleted_at='2026-10-26T08:00:00.000Z' WHERE id=?").run(next);
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(0);
  expect(await readCycleRows(peer.port)).toEqual(rows);
  const calls: (readonly string[] | undefined)[] = [];
  const bounded = { ...persistence, learningSnapshot: (db: Parameters<typeof persistence.learningSnapshot>[0], ids?: readonly string[]) => {
    calls.push(ids); return persistence.learningSnapshot(db, ids);
  } };
  session = (await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), bounded)).session;
  session = await act(peer, session, 'read');
  expect(session.currentNodeId).not.toBe(next);
  expect(session.currentNodeId).not.toBe('new');
  expect(calls.every(ids => ids !== undefined)).toBe(true);
  await open(peer);
  expect(await readCycleRows(peer.port, ['new'])).toEqual([]);
});

it('ignores same-value reading updates while retaining real learning changes and transactional rollback', async () => {
  const [peer] = await setupPeers();
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const session = await open(peer);
  await act(peer, session, 'read');
  await open(peer);
  peer.db.exec('UPDATE node_reading SET state=state, next_at=next_at');
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(0);
  expect(() => peer.db.transaction(() => {
    peer.db.exec("UPDATE node_reading SET state='dismissed'");
    expect(peer.db.prepare('SELECT invalidated FROM daily_flow_state').pluck().get()).toBe(1);
    throw new Error('rollback');
  })()).toThrow('rollback');
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(0);
  peer.db.exec("UPDATE node_reading SET next_at='2026-10-28T08:00:00.000Z'");
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(1);
});

it('keeps a handled topic body save independent from its unchanged persisted reading facts', async () => {
  const [peer] = await setupPeers();
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const session = await open(peer);
  await act(peer, session, 'read');
  await open(peer);
  const id = session.currentNodeId!;
  const reading = (await snapshot(peer)).nodesById[id]!.reading!;
  const before = peer.db.prepare('SELECT * FROM node_reading ORDER BY node_id').all();
  upsertNodeSnapshot(peer.driver, { nodeId: id, kind: 'topic', title: id, content: 'Edited after Read',
    parentNodeId: null, position: null, isTitleManual: true, anchorLink: null, reveal: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now, reading });
  expect(peer.db.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(before);
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(0);
});

it('does not consume due review tasks merely because reading-only selection passes their slots', async () => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peer, id, 'item');
  node(peer, 'z', 'topic');
  const initial = await open(peer);
  const rows = await readCycleRows(peer.port);
  const reading = await open(peer, now, settings(peer), 'reading-only');
  expect(reading.currentNodeId).toBe('z');
  expect(reading.cycle!.remaining).toBe(initial.cycle!.remaining);
  expect(reading.cycle!.reviewRemaining).toBe(initial.cycle!.reviewRemaining);
  expect(await readCycleRows(peer.port)).toEqual(rows);
});
