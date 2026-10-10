// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { loadPendingNodeVersionReceipts } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord, loadStoredSyncNodeVersionRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { nodeVersionSyncAdapter } from '../../src/shared/platform/companionSyncPushProtocol.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { applyNodePushBatchWithDbPort } from './companionSyncNodeConvergence.js';
import {
  buildPack, closeLibraries, createPeer, edit, joinPeers, receivePack, startLibraries, sync, type Peer
} from './syncEmptyLibraryTestSupport.js';

beforeEach(async () => {
  await startLibraries();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T00:00:00.000Z'));
});
afterEach(() => { closeLibraries(); vi.useRealTimers(); });

const current = async (peer: Peer) => (await loadCurrentSyncNodeRecord(peer.port, 'topic'))!;
const alternatives = async (peer: Peer) => ((await current(peer)).alternative_bodies ?? []).map((entry) => entry.text).sort();

async function fork(equal = false, missingOnBoth = true) {
  const left = createPeer('left');
  const right = createPeer('right');
  const fresh = createPeer('fresh');
  joinPeers(left, right, fresh);
  const a = edit(left, 'Original\nx=0\n');
  await sync(left, right);
  await sync(right, left);
  edit(left, 'Left intermediate\nx=0\n');
  edit(right, 'Right intermediate\nx=1\n');
  const b = edit(left, equal ? 'Shared body' : 'Left final\nx=0\n');
  const c = edit(right, equal ? 'Shared body' : 'Original\nx=1\n');
  for (const peer of missingOnBoth ? [left, right] : [left]) {
    // Model an existing historical gap only in these disposable databases.
    peer.db.prepare('DELETE FROM node_sync_versions WHERE version_id = ?').run(a);
  }
  return { left, right, fresh, a, b, c };
}

function restart(peer: Peer) {
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.db.pragma('foreign_keys = ON');
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
}

async function exchange(source: Peer, target: Peer) {
  const pack = await buildPack(source, target);
  await receivePack(source, target, pack);
  const receipt = (await loadPendingNodeVersionReceipts(target.port, source.id))
    .find((entry) => entry.packId === pack.packId)!;
  await confirmOutboundNodeVersionPack(source.port, { ...receipt, confirmedAt: '2026-09-30T01:00:00Z' });
  return pack;
}

function assertReopened(peer: Peer, body: string, version: string, missing: string[]) {
  const db = new Database(peer.file, { readonly: true });
  try {
    expect(loadNodeBodyResolution(createBetterSqlite3Driver(db), 'topic'))
      .toMatchObject({ status: 'resolved', content: body });
    expect(db.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get()).toBe(version);
    const gaps = db.prepare(`SELECT DISTINCT p.parent_version_id FROM node_sync_version_parents p
      LEFT JOIN node_sync_versions v ON v.version_id = p.parent_version_id WHERE v.version_id IS NULL`)
      .pluck().all();
    expect(gaps.sort()).toEqual([...missing].sort());
    expect(db.prepare("SELECT count(*) FROM nodes WHERE id LIKE 'topic%'").pluck().get()).toBe(1);
  } finally { db.close(); }
}

it.each([false, true])('merges missing-base branches and retains available bodies through edit, restart and replay (equal=%s)', async (equal) => {
  const { left, right, fresh, a, b, c } = await fork(equal);
  const originals = [left, right].flatMap((peer) => peer.db.prepare(
    'SELECT version_id, parent_version_id, content_hash FROM node_sync_versions'
  ).all());
  const fromLeft = await buildPack(left, right);
  const fromRight = await buildPack(right, left);
  await receivePack(left, right, fromLeft);
  await receivePack(right, left, fromRight);
  const merged = await current(left);
  expect(await current(right)).toEqual(merged);
  expect(new Set(merged.parent_version_ids)).toEqual(new Set([b, c]));
  for (const peer of [left, right]) {
    expect(new Set([merged.body_text, ...await alternatives(peer)]))
      .toEqual(new Set(equal ? ['Shared body'] : ['Left final\nx=0\n', 'Original\nx=1\n']));
    expect(peer.db.prepare('SELECT version_id FROM node_sync_versions WHERE version_id = ?').get(a)).toBeUndefined();
    if (equal) expect(await alternatives(peer)).toEqual([]);
    else expect(await alternatives(peer)).toEqual(['Original\nx=1\n']);
    for (const original of originals) expect(peer.db.prepare(
      'SELECT version_id, parent_version_id, content_hash FROM node_sync_versions WHERE version_id = ?'
    ).get((original as { version_id: string }).version_id)).toEqual(original);
    assertReopened(peer, merged.body_text!, merged.version_id!, [a]);
    restart(peer);
  }
  await exchange(left, fresh);
  assertReopened(fresh, merged.body_text!, merged.version_id!, [a]);
  expect(await alternatives(fresh)).toEqual(await alternatives(left));
  const versionCount = left.db.prepare('SELECT count(*) FROM node_sync_versions').pluck().get();
  await receivePack(left, right, fromLeft);
  await receivePack(right, left, fromRight);
  expect(left.db.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(versionCount);
  const edited = edit(left, 'Edited after merge');
  expect((await current(left)).parent_version_ids).toEqual([merged.version_id]);
  for (const peer of [left, right]) restart(peer);
  await exchange(left, right);
  await exchange(right, left);
  restart(fresh);
  await exchange(left, fresh);
  for (const peer of [left, right, fresh]) {
    assertReopened(peer, 'Edited after merge', edited, [a]);
    if (!equal) expect(await alternatives(peer)).toEqual(await alternatives(left));
  }
});

it('restores peer base identity and preserves each complete divergent body', async () => {
  const { left, right, a, c } = await fork(false, false);
  await exchange(right, left);
  const merged = await current(left);
  expect(new Set([merged.body_text, ...await alternatives(left)]))
    .toEqual(new Set(['Left final\nx=0\n', 'Original\nx=1\n']));
  expect(merged.parent_version_ids).toContain(c);
  expect(await alternatives(left)).toEqual(['Original\nx=1\n']);
  await exchange(left, right);
  expect((await current(right)).version_id).toBe(merged.version_id);
  expect((await current(right)).body_text).toBe(merged.body_text);
  for (const peer of [left, right]) {
    expect(peer.db.prepare('SELECT version_id FROM node_sync_versions WHERE version_id = ?').pluck().get(a))
      .toBe(a);
    assertReopened(peer, merged.body_text!, merged.version_id!, []);
  }
});

it('keeps the original anchored topic identity when companion pushes branches whose common ancestor is missing', async () => {
  const { left, right, a, b, c } = await fork();
  const incoming = await current(right);
  const anchored = { ...incoming, snapshot: { ...incoming.snapshot,
    anchor_link: '{"id":"highlight","kind":"highlight"}' } };
  const payload = nodeVersionSyncAdapter.buildPushPayload(anchored);
  const ancestors = right.db.prepare('SELECT version_id FROM node_sync_versions WHERE version_id <> ?')
    .pluck().all(c) as string[];
  const history = await Promise.all(ancestors.map(async (id) =>
    nodeVersionSyncAdapter.buildPushPayload((await loadStoredSyncNodeVersionRecord(right.port, id))!)));
  const result = await applyNodePushBatchWithDbPort(left.port, [payload, ...history]);
  expect(result.acks.every((ack) => ack.status === 'accepted')).toBe(true);
  expect(result.acks.every((ack) => ack.canonicalObjectId === undefined)).toBe(true);
  const merged = await current(left);
  expect(new Set(merged.parent_version_ids)).toEqual(new Set([b, c]));
  expect(await alternatives(left)).toEqual(['Original\nx=1\n']);
  expect((await applyNodePushBatchWithDbPort(left.port, [payload])).acks[0]?.status).toBe('accepted');
  assertReopened(left, merged.body_text!, merged.version_id!, [a]);
});

it('transports every parent reference when a merge has both retained and missing parents', async () => {
  const { left, right, a } = await fork(true);
  const head = await current(left);
  const withMissing = { ...head, version_id: 'multi-parent-head', content_hash: 'multi-parent-head',
    parent_version_id: head.version_id, parent_version_ids: [head.version_id!, a],
    ancestor_version_ids: [head.version_id!, ...head.ancestor_version_ids] };
  await applySyncNodesWithDbPort(left.port, [withMissing]);
  await exchange(left, right);
  expect((await loadCurrentSyncNodeRecord(right.port, 'topic'))!.ancestor_version_ids).toContain(a);
  expect(right.db.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY ordinal')
    .pluck().all(withMissing.version_id)).toEqual([head.version_id, a]);
});

it.each(['identity', 'body'])('still rejects an unavailable current version %s', async (unavailable) => {
  const { left, right } = await fork();
  const pack = await buildPack(left, right);
  const incoming = new Database(pack.incoming);
  try {
    if (unavailable === 'identity') incoming.prepare("UPDATE nodes SET current_version_id = 'absent-current'").run();
    else incoming.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL)
      WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 'topic')`).run();
  } finally { incoming.close(); }
  const before = await current(right);
  await expect(receivePack(left, right, pack)).rejects.toThrow(/current_version_missing|body_unavailable/);
  expect(await current(right)).toEqual(before);
});
