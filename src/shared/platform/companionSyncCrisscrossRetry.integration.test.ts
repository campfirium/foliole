// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { applyNodePushBatchWithDbPort } from '../../../electron/database/companionSyncNodeConvergence.js';
import { flushNodeSyncVersionWithDriver } from '../../../electron/database/nodeSyncVersionFromDriver.js';
import { assertPersisted, buildPack, closeLibraries, createPeer, edit, joinPeers,
  receivePack, startLibraries, sync, type Peer } from '../../../electron/database/syncEmptyLibraryTestSupport.js';
import { upsertNodeSnapshot } from '../../../lib/core/database/nodeMutations.js';
import type { DbParams, DbRow } from '../../../lib/core/sync/dbPort.js';
import { confirmOutboundNodeVersionPack } from '../../../lib/core/sync/nodeVersionDeliveryProof.js';
import { advanceInboundNodePeerBases } from '../../../lib/core/sync/nodeVersionInboundPeerBase.js';
import { loadPendingNodeVersionReceipts } from '../../../lib/core/sync/nodeVersionInboundReceipt.js';
import { repairDirectChildAnchorsForAppliedParent } from '../../../lib/core/sync/syncNodeAnchorRepair.js';
import { loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';

import { createCompanionSyncbackDbStore } from './companion/sync/syncback/companionSyncbackDbStore.js';
import { nodeVersionSyncAdapter, type SyncPushAck } from './companionSyncPushProtocol.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

async function receivePush(target: Peer, source: Peer, items: Parameters<typeof applyNodePushBatchWithDbPort>[1]) {
  return target.port.transaction(async tx => {
    const result = await applyNodePushBatchWithDbPort(tx, items);
    await advanceInboundNodePeerBases(tx, source.id, result.acks.filter(ack => ack.status === 'accepted' &&
      typeof ack.versionId === 'string' && !ack.canonicalObjectId)
      .map(ack => ({ objectId: ack.identity.objectId, versionId: ack.versionId! })));
    return result;
  });
}

function store(peer: Peer) {
  return createCompanionSyncbackDbStore({ ...peer.port, query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
    const values: (typeof params)[number][] = [];
    const normalized = sql.replace(/\?(\d+)/g, (_, index: string) => {
      values.push(params[Number(index) - 1]!);
      return '?';
    });
    return peer.port.query<T>(normalized, values.length ? values : params);
  } });
}

async function outgoing(source: Peer, target: Peer) {
  const items = (await store(source).loadNodeVersions(target.id, null, 100))
    .filter(record => record.object_id === 'topic')
    .map(record => nodeVersionSyncAdapter.buildPushPayload(record));
  expect(items.length).toBeGreaterThan(0);
  expect(items.every(item => item.base.kind !== 'blocked')).toBe(true);
  await store(source).stagePushItems(target.id, items);
  return items;
}

async function annotate(peer: Peer, versionId: string, content: string) {
  const at = '2026-09-30T00:10:00.000Z';
  const nodeId = `note-${peer.name}`;
  peer.driver.transaction(driver => {
    upsertNodeSnapshot(driver, { nodeId, hostName: peer.name, parentNodeId: 'topic', kind: 'item',
      title: 'Note', isTitleManual: true, content: 'Annotation', position: null, reveal: null,
      anchorLink: { id: nodeId, kind: 'highlight', locator: { from: 0, to: content.length, originalText: content } },
      createdAt: at, updatedAt: at });
    flushNodeSyncVersionWithDriver(driver, nodeId, peer.name, at);
  });
  await repairDirectChildAnchorsForAppliedParent({ port: peer.port, parentNodeId: 'topic',
    content, sourceVersionId: versionId, updatedAt: at });
}

async function diverge() {
  const left = createPeer('left');
  const right = createPeer('right');
  joinPeers(left, right);
  for (const peer of [left, right]) {
    peer.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    peer.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?, 'now')").run(peer.name);
  }
  edit(left, 'Original');
  await sync(left, right);
  await sync(right, left);
  await annotate(left, edit(left, 'Left edit', 'Title A'), 'Left edit');
  await annotate(right, edit(right, 'Right edit', 'Title B'), 'Right edit');
  const [fromLeft, fromRight] = await Promise.all([outgoing(left, right), outgoing(right, left)]);
  const leftResult = await receivePush(left, right, fromRight);
  const rightResult = await receivePush(right, left, fromLeft);
  expect(leftResult.acks.every(ack => ack.status === 'accepted')).toBe(true);
  expect(rightResult.acks.every(ack => ack.status === 'accepted')).toBe(true);
  await store(right).savePushAcks(left.id, leftResult.acks as SyncPushAck[]);
  await store(left).savePushAcks(right.id, rightResult.acks as SyncPushAck[]);
  assertPersisted(left, 'Left edit');
  assertPersisted(right, 'Right edit');
  return { left, right };
}

function reopen(peer: Peer) {
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.db.pragma('foreign_keys = ON');
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
}

it.each([false, true])('keeps converged heads across staged sender reload, forwarding, and reopen (replyLost=%s)', async replyLost => {
  const { left, right } = await diverge();
  edit(left, 'Intermediate body', 'Title A');
  edit(right, 'Intermediate body', 'Title B');
  edit(left, 'Shared final body', 'Title A');
  edit(right, 'Shared final body', 'Title B');
  const [fromLeft, fromRight] = await Promise.all([outgoing(left, right), outgoing(right, left)]);
  if (replyLost) {
    await receivePush(left, right, fromRight);
    await receivePush(right, left, fromLeft);
  }
  const toLeft = await buildPack(right, left);
  const toRight = await buildPack(left, right);
  await receivePack(right, left, toLeft);
  await receivePack(left, right, toRight);
  for (const [source, target, pack] of [[right, left, toLeft], [left, right, toRight]] as const) {
    const receipt = (await loadPendingNodeVersionReceipts(target.port, source.id))
      .find(item => item.packId === pack.packId)!;
    await confirmOutboundNodeVersionPack(source.port, { ...receipt, confirmedAt: '2026-09-30T01:00:00Z' });
  }
  const final = (await loadCurrentSyncNodeRecord(left.port, 'topic'))!;
  assertPersisted(left, 'Shared final body', final.version_id!);
  assertPersisted(right, 'Shared final body', final.version_id!);
  for (const peer of [left, right]) reopen(peer);
  for (const [source, target] of [[left, right], [right, left]] as const) {
    const items = await outgoing(source, target);
    const alternatives = () => target.db.prepare(`SELECT body_text FROM node_text_alternatives
      WHERE node_id = 'topic' AND status = 'available' ORDER BY body_text`).pluck().all();
    const beforeAlternatives = alternatives();
    const result = await receivePush(target, source, items);
    expect(result.acks.every(ack => ack.status === 'accepted')).toBe(true);
    assertPersisted(target, 'Shared final body', final.version_id!);
    expect(alternatives()).toEqual(beforeAlternatives);
    await store(source).savePushAcks(target.id, result.acks as SyncPushAck[]);
  }
  await sync(left, right);
  await sync(right, left);
  assertPersisted(left, 'Shared final body', final.version_id!);
  assertPersisted(right, 'Shared final body', final.version_id!);
});
