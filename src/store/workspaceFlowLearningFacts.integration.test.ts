// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { scopedDailyLearningSnapshot } from '../../lib/core/flow/dailyFlowGrade';
import { flowPlan } from '../../lib/core/flow/dailyFlowPlanning';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { assertDurable, node, now, open, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);

it('uses display snapshots only for the receipt while Soon validates facts and selects its successor', async () => {
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  const session = await open(peer, now, settings(peer), 'reading-only');
  const displayReadsAfterCommit: boolean[] = [];
  const opId = 'facts-soon';
  const result = await commitDailyFlow(peer.port, { opId, now, token: session.daily!, sourceSession: session,
    readingAction: 'soon', readings: [{ nodeId: session.currentNodeId!, before: null, after: null }] }, settings(peer), {
    ...persistence,
    snapshot: async (db, ids) => {
      displayReadsAfterCommit.push(Boolean(peer.db.prepare('SELECT 1 FROM daily_flow_operations WHERE op_id=?').get(opId)));
      return persistence.snapshot(db, ids);
    }
  });
  expect(displayReadsAfterCommit.every(Boolean)).toBe(true);
  expect(result.session.currentNodeId).not.toBe(session.currentNodeId);
  expect(result.session.readTopicCount).toBe(1);
  expect(peer.db.prepare('SELECT COUNT(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
  await assertDurable(peer, result.session);
  expect((await readDailyFlow(peer.port))!.session).toEqual(result.session);
  expect((await open(peer, now, settings(peer), 'reading-only')).currentNodeId).toBe(result.session.currentNodeId);
});

it('reads parent visibility and learning profiles without opening display tables or transferring their payload', async () => {
  node(peer, 'folder', 'folder');
  node(peer, 'article', 'topic', 'folder');
  peer.db.prepare("UPDATE nodes SET content=?, body_blob_hash='missing-body' WHERE id='article'")
    .run('---\ncollections: [irrelevant]\n---\nprivate display body');
  peer.db.exec('ALTER TABLE content_blobs RENAME TO unavailable_display_blobs');
  const facts = await scopedDailyLearningSnapshot(peer.port, persistence, ['article']);
  expect(Object.keys(facts.nodesById).sort()).toEqual(['article', 'folder']);
  expect(facts.nodesById.article).toMatchObject({ parentNodeId: 'folder', kind: 'topic', hasContent: true,
    reading: null, review: null });
  for (const field of ['title', 'content', 'reveal', 'collections', 'attachments', 'readwiseRemoteLifecycle', 'openingText']) {
    expect(facts.nodesById.article).not.toHaveProperty(field);
  }
  peer.db.prepare("UPDATE nodes SET shelved_at=? WHERE id='folder'").run(now);
  expect((await scopedDailyLearningSnapshot(peer.port, persistence, ['article'])).nodesById.folder!.shelvedAt).toBe(now);
  peer.db.prepare("UPDATE nodes SET deleted_at=? WHERE id='folder'").run(now);
  const deleted = await scopedDailyLearningSnapshot(peer.port, persistence, ['article']);
  expect(deleted.trashedNodeIds).toContain('folder');
});

it('initializes and reconciles the daily list without reading a full workspace display snapshot', async () => {
  for (const id of ['a', 'b']) node(peer, id, 'topic');
  const displayReads: (readonly string[] | undefined)[] = [];
  const learningOnly = { ...persistence, snapshot: async (db: Parameters<typeof persistence.snapshot>[0], ids?: readonly string[]) => {
    displayReads.push(ids);
    return persistence.snapshot(db, ids);
  } };
  const initial = await openDailyFlow(peer.port, { now, mode: 'reading-only' }, settings(peer), learningOnly);
  expect(initial.session.currentNodeId).toBeTruthy();
  node(peer, 'arrival', 'topic');
  const refreshed = await openDailyFlow(peer.port, { now, mode: 'reading-only', refresh: true }, settings(peer), learningOnly);
  expect(refreshed.session.currentNodeId).toBe(initial.session.currentNodeId);
  expect(peer.db.prepare("SELECT active FROM daily_flow_entries WHERE node_id='arrival'").get()).toEqual({ active: 1 });
  expect(displayReads.every(ids => ids !== undefined)).toBe(true);
  await assertDurable(peer, refreshed.session);
});

it('retains the existing candidate order and profiles for full and scoped learning reads', async () => {
  node(peer, 'folder', 'folder');
  node(peer, 'first', 'topic', 'folder');
  node(peer, 'second', 'topic', 'folder');
  node(peer, 'card', 'item');
  node(peer, 'deleted', 'topic');
  peer.db.prepare("UPDATE nodes SET deleted_at=? WHERE id='deleted'").run(now);
  const profile = { intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now, nextAt: now,
    priority: 5, readingPosition: 42, repetitionCount: 3, state: 'active' as const };
  await persistence.reading(peer.port, { nodeId: 'first', before: null, after: profile }, now);
  const display = await persistence.snapshot(peer.port);
  const full = await persistence.learningSnapshot(peer.port);
  expect(full.nodeOrder).toEqual(display.nodeOrder);
  for (const id of full.nodeOrder) {
    const node = full.nodesById[id]!;
    expect(node.reading ?? null).toEqual(display.nodesById[id]!.reading);
    expect(node.review).toEqual(display.nodesById[id]!.review);
    expect(node.hasContent).toBe(display.nodesById[id]!.hasContent);
    expect(node.hasReveal).toBe(display.nodesById[id]!.hasReveal);
  }
  expect(full.nodesById.first!.reading).toEqual(profile);
  const scoped = await scopedDailyLearningSnapshot(peer.port, persistence, ['first']);
  expect(scoped.nodesById.first).toEqual(full.nodesById.first);
  for (const mode of ['reading-only', 'review-first', 'recommended'] as const) {
    expect(flowPlan(full, mode, now, settings(peer))).toEqual(flowPlan(display, mode, now, settings(peer)));
  }
});

it('executes full and scoped learning reads using only learning, identity and ordering tables', async () => {
  node(peer, 'folder', 'folder');
  node(peer, 'article', 'topic', 'folder');
  const pages = new Map(peer.db.prepare('SELECT rootpage, tbl_name FROM sqlite_schema WHERE rootpage > 0')
    .all().map(value => { const row = value as { rootpage: number; tbl_name: string }; return [row.rootpage, row.tbl_name]; }));
  const tables = new Set<string>();
  const audited: DbPort = { ...peer.port, query: async <T extends DbRow>(sql: string, values?: DbParams) => {
    const instructions = peer.db.prepare(`EXPLAIN ${sql}`).all(...(values ?? [])) as { opcode: string; p2: number }[];
    for (const instruction of instructions) {
      const table = instruction.opcode === 'OpenRead' ? pages.get(instruction.p2) : undefined;
      if (table) tables.add(table);
    }
    return peer.port.query<T>(sql, values);
  } };
  await persistence.learningSnapshot(audited);
  await scopedDailyLearningSnapshot(audited, persistence, ['article']);
  expect([...tables].sort()).toEqual(['companion_meta', 'node_reading', 'node_reading_host_state', 'node_review', 'nodes', 'parent_child_order']);
});

it('rejects a stale host reading position committed by a separate connection before Soon', async () => {
  node(peer, 'article', 'topic');
  const profile = { intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now, nextAt: now,
    priority: 5, readingPosition: 42, repetitionCount: 3, state: 'active' as const };
  await persistence.reading(peer.port, { nodeId: 'article', before: null, after: profile }, now);
  const initial = await open(peer, now, settings(peer), 'reading-only');
  const other = new Database(peer.file);
  try {
    other.prepare('UPDATE node_reading_host_state SET reading_position=84 WHERE node_id=? AND host_name=?')
      .run('article', peer.name);
  } finally { other.close(); }
  await expect(commitDailyFlow(peer.port, { opId: 'stale-position', now, token: initial.daily!, sourceSession: initial,
    readingAction: 'soon', readings: [{ nodeId: 'article', before: profile, after: profile }] }, settings(peer), persistence))
    .rejects.toThrow('daily_flow_learning_changed');
  expect((await persistence.learningSnapshot(peer.port, ['article'])).nodesById.article!.reading!.readingPosition).toBe(84);
  expect((await readDailyFlow(peer.port))!.session).toEqual(initial);
  expect(peer.db.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
});
