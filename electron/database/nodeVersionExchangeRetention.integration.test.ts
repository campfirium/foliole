// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { retainNodeVersionExchange, retainNodeVersionExchangeWithDriver,
  releaseNodeVersionExchange, releaseNodeVersionExchangeWithDriver,
  type NodeVersionExchangeDependencies } from '../../lib/core/sync/nodeVersionExchangeRetention.js';
import { retainSubmittedLocalEdit } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { describeVersionFact } from '../../lib/core/sync/syncPackFactPresence.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync,
  type Peer } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function dependencies(peer: Peer, versionId: string): NodeVersionExchangeDependencies {
  const row = peer.driver.queryOne<Parameters<typeof describeVersionFact>[0]>(
    `SELECT *, json_remove(snapshot_json, '$.content') AS snapshot_metadata
      FROM node_sync_versions WHERE version_id = ?`, [versionId]);
  if (!row) throw new Error('test_version_missing');
  return { sourceViewId: 'view-one', exchangeId: 'page-one',
    bodies: [describeVersionFact(row)], parents: peer.driver.queryAll(
      'SELECT * FROM node_sync_version_parents WHERE version_id = ?', [versionId]) };
}

function reopen(peer: Peer) {
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.db.pragma('foreign_keys = ON');
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
}

it.each(['port', 'driver'] as const)('persists exact exchange bodies through production edits, collection and database reopen (%s)', async (adapter) => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const base = edit(source, 'Original base');
  await sync(source, target);
  const dep = dependencies(source, base);
  if (adapter === 'port') await retainNodeVersionExchange(source.port, dep);
  else retainNodeVersionExchangeWithDriver(source.driver, dep);
  const head = edit(source, 'New head');
  await sync(source, target);
  await retainSubmittedLocalEdit(source.port, 'topic', base, head);
  expect(source.db.prepare('SELECT COUNT(*) FROM node_version_local_holds').pluck().get()).toBe(1);
  reopen(source);
  expect(source.db.prepare('SELECT version_id FROM node_version_local_holds').pluck().get()).toBe(base);
  collectNodeVersionChainWithDriver(source.driver, 'topic');
  await collectNodeVersionPayloads(source.port, 'topic');
  expect(history(source).find((row) => row.version_id === base)?.body_text).toBe('Original base');
  await releaseNodeVersionExchange(source.port,
    { sourceViewId: 'another-view', exchangeId: dep.exchangeId, reason: 'confirmed' });
  expect(source.db.prepare('SELECT COUNT(*) FROM node_version_local_holds').pluck().get()).toBe(1);
  if (adapter === 'port') await releaseNodeVersionExchange(source.port,
    { sourceViewId: dep.sourceViewId, exchangeId: dep.exchangeId, reason: 'confirmed' });
  else releaseNodeVersionExchangeWithDriver(source.driver,
    { sourceViewId: dep.sourceViewId, exchangeId: dep.exchangeId, reason: 'confirmed' });
  await collectNodeVersionPayloads(source.port, 'topic');
  expect(history(source).find((row) => row.version_id === base)?.body_text).toBeNull();
  expect(history(source).find((row) => row.version_id === head)?.parent_version_id).toBe(base);
  expect(source.db.prepare('SELECT * FROM node_sync_version_parents WHERE version_id = ?').get(head))
    .toEqual({ version_id: head, parent_version_id: base, ordinal: 0 });
});

it('rejects missing or changed original dependencies atomically and invalidates only the chosen view', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const base = edit(source, 'Base');
  const dep = dependencies(source, base);
  await expect(retainNodeVersionExchange(source.port,
    { ...dep, bodies: [...dep.bodies, { ...dep.bodies[0]!, version_id: 'absent' }] }))
    .rejects.toThrow('node_exchange_dependency_unavailable');
  expect(source.db.prepare('SELECT COUNT(*) FROM node_version_local_holds').pluck().get()).toBe(0);
  await expect(retainNodeVersionExchange(source.port,
    { ...dep, bodies: [{ ...dep.bodies[0]!, content_hash: 'changed' }] }))
    .rejects.toThrow('sync_pack_node_version_immutable_mismatch');
  await retainNodeVersionExchange(source.port, dep);
  await retainNodeVersionExchange(source.port, { ...dep, sourceViewId: 'view-two' });
  await retainNodeVersionExchange(source.port, dep);
  await releaseNodeVersionExchange(source.port, { sourceViewId: 'view-one', reason: 'view_invalidated' });
  expect(source.db.prepare('SELECT COUNT(*) FROM node_version_local_holds').pluck().get()).toBe(1);
  await expect(releaseNodeVersionExchange(source.port, { sourceViewId: 'view-two', reason: 'confirmed', exchangeId: '' }))
    .rejects.toThrow('node_exchange_confirmation_invalid');
});
