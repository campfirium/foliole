// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { loadPendingNodeVersionReceipts } from '../../lib/core/sync/nodeVersionInboundReceipt.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { assertPersisted, buildPack, closeLibraries, createPeer, edit, history, joinPeers,
  receivePack, startLibraries, sync, type Peer } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function restart(peer: Peer) {
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.db.pragma('foreign_keys = ON');
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
}

async function receipt(source: Peer, target: Peer, packId: string) {
  return (await loadPendingNodeVersionReceipts(target.port, source.id)).find((item) => item.packId === packId)!;
}

it('preserves a concrete in-flight send across edits and restart, then releases it after exact confirmation', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const base = edit(source, 'base');
  await sync(source, target);
  const sent = edit(source, 'sent');
  const pack = await buildPack(source, target);
  const unsent = edit(source, 'unsent-middle');
  const head = edit(source, 'current');
  restart(source);
  expect(history(source).map((row) => row.version_id)).toEqual([base, sent, head]);
  expect(history(source).find((row) => row.version_id === unsent)).toBeUndefined();
  await receivePack(source, target, pack);
  const ack = await receipt(source, target, pack.packId);
  await confirmOutboundNodeVersionPack(source.port, { ...ack, confirmedAt: 'later' });
  expect(history(source).map((row) => row.version_id)).toEqual([sent, head]);
  await sync(source, target);
  expect(history(source).map((row) => row.version_id)).toEqual([head]);
  await confirmOutboundNodeVersionPack(source.port, { ...ack, confirmedAt: 'retry' });
  expect(history(source).map((row) => row.version_id)).toEqual([head]);
  assertPersisted(source, 'current', head);
  assertPersisted(target, 'current', head);
});

it('accepts a delayed exact acknowledgement without regressing the newer direct peer base', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'one');
  const first = await buildPack(source, target);
  await receivePack(source, target, first);
  const oldAck = await receipt(source, target, first.packId);
  const head = edit(source, 'two');
  await sync(source, target);
  await confirmOutboundNodeVersionPack(source.port, { ...oldAck, confirmedAt: 'delayed' });
  expect(history(source).map((row) => row.version_id)).toEqual([head]);
  expect(source.db.prepare('SELECT version_id FROM node_version_device_bases').pluck().get()).toBe(head);
  expect(source.db.prepare('SELECT COUNT(*) AS count FROM node_version_outbound_holds').get()).toEqual({ count: 0 });
});
