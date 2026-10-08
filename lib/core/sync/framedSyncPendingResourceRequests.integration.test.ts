// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA } from '../database/framedSyncResourceDemandSchema.js';

import { canonicalContentId } from './framedSyncCanonicalManifest.js';
import { loadFramedSyncPendingResourceRequests } from './framedSyncPendingResourceRequests.js';
import { ensureFramedSyncMissingResourceDemand, startFramedSyncResourceDemandRequest } from './framedSyncResourceDemands.js';
import { projectFramedSyncResourceFact } from './framedSyncResourceFact.js';

it('keeps pending resource identity stable when current article state changes and never substitutes a missing version', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA);
    sqlite.exec(`CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      content_hash TEXT, snapshot_json TEXT, body_text TEXT);
      CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT, body_blob_hash TEXT)`);
    const bodyHash = 'a'.repeat(64);
    const versionHash = 'c'.repeat(64);
    sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?)')
      .run('old-version', 'article', versionHash, JSON.stringify({ body_blob_hash: bodyHash }), 'x'.repeat(3 * 1024 * 1024));
    sqlite.prepare('INSERT INTO nodes VALUES (?, ?, ?)').run('article', 'old-version', bodyHash);
    const db = createBetterSqliteDbPort(sqlite);
    const receiver = { groupId: 'group', receiverDeviceId: 'B', receiverLibraryEpoch: 'b' };
    await ensureFramedSyncMissingResourceDemand(db, { ...receiver, globalId: 'article',
      versionId: 'old-version', bodyHash, storageKey: `${'b'.repeat(64)}.png` }, () => 'demand');
    const before = await loadFramedSyncPendingResourceRequests(db, receiver);
    expect(before.resources[0]!.sharedStateHash).toEqual(new Uint8Array(32).fill(0xcc));
    sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?)')
      .run('new-version', 'article', 'd'.repeat(64), JSON.stringify({ body_blob_hash: 'e'.repeat(64) }), 'different');
    sqlite.exec("UPDATE nodes SET current_version_id = 'new-version'");
    const after = await loadFramedSyncPendingResourceRequests(db, receiver);
    expect(after).toEqual(before);
    const identity = async (binding: typeof before.resources[number]) => {
      const fact = projectFramedSyncResourceFact(binding,
        { contentHash: 'b'.repeat(64), storageKey: binding.storageKey, role: 2 }, 123n);
      return canonicalContentId({ facts: [fact], blobs: fact.blobs });
    };
    expect(await identity(after.resources[0]!)).toEqual(await identity(before.resources[0]!));
    sqlite.exec("DELETE FROM node_sync_versions WHERE version_id = 'old-version'");
    expect(await loadFramedSyncPendingResourceRequests(db, receiver)).toEqual({
      afterId: 'demand', resources: [], unavailableDemandIds: ['demand'] });
    expect((await loadFramedSyncPendingResourceRequests(db, { ...receiver, receiverLibraryEpoch: 'other' })).resources)
      .toEqual([]);
  } finally { sqlite.close(); }
});

it('reconstructs a started request after its old version is removed without adopting another summary', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-frozen-resource-request-'));
  const file = path.join(root, 'library.db');
  let sqlite = new Database(file);
  try {
    sqlite.exec(FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA);
    sqlite.exec(`CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      content_hash TEXT, snapshot_json TEXT)`);
    let db = createBetterSqliteDbPort(sqlite);
    const key = { groupId: 'group', receiverDeviceId: 'B', receiverLibraryEpoch: 'b',
      globalId: 'article', versionId: 'old', bodyHash: 'a'.repeat(64), storageKey: `${'b'.repeat(64)}.png` };
    sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?)')
      .run('old', 'article', 'c'.repeat(64), JSON.stringify({ body_blob_hash: key.bodyHash }));
    await ensureFramedSyncMissingResourceDemand(db, key, () => 'demand');
    const before = await loadFramedSyncPendingResourceRequests(db, key);
    await startFramedSyncResourceDemandRequest(db, key, 'demand', before.resources[0]!.sharedStateHash);
    sqlite.exec("DELETE FROM node_sync_versions WHERE version_id = 'old'");
    sqlite.close();
    sqlite = new Database(file);
    db = createBetterSqliteDbPort(sqlite);
    expect(await loadFramedSyncPendingResourceRequests(db, key)).toEqual(before);
  } finally {
    if (sqlite.open) sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('pages demand metadata without losing unavailable bindings or crossing receiver identities', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA);
    sqlite.exec(`CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      content_hash TEXT, snapshot_json TEXT)`);
    const db = createBetterSqliteDbPort(sqlite);
    const receiver = { groupId: 'group', receiverDeviceId: 'B', receiverLibraryEpoch: 'b' };
    const insert = sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?)');
    for (let index = 0; index < 130; index += 1) {
      const id = index.toString().padStart(3, '0');
      const bodyHash = 'a'.repeat(64);
      insert.run(id, index === 65 ? 'wrong-owner' : id, 'c'.repeat(64),
        JSON.stringify({ body_blob_hash: index === 129 ? 'd'.repeat(64) : bodyHash }));
      await ensureFramedSyncMissingResourceDemand(db, { ...receiver, globalId: id,
        versionId: id, bodyHash, storageKey: `${'b'.repeat(64)}.png` }, () => id);
    }
    const first = await loadFramedSyncPendingResourceRequests(db, receiver);
    const scoped = await loadFramedSyncPendingResourceRequests(db, receiver, '', '064');
    expect(scoped.resources.map((resource) => resource.globalId)).toEqual(['064']);
    const second = await loadFramedSyncPendingResourceRequests(db, receiver, first.afterId!);
    const third = await loadFramedSyncPendingResourceRequests(db, receiver, second.afterId!);
    expect(first.resources).toHaveLength(64);
    expect(second.resources).toHaveLength(63);
    expect(third.resources).toHaveLength(1);
    expect([first.afterId, second.afterId, third.afterId]).toEqual(['063', '127', '129']);
    expect(second.unavailableDemandIds).toEqual(['065']);
    expect(third.unavailableDemandIds).toEqual(['129']);
    expect(await loadFramedSyncPendingResourceRequests(db, receiver, third.afterId!))
      .toEqual({ afterId: null, resources: [], unavailableDemandIds: [] });
    expect((await loadFramedSyncPendingResourceRequests(db,
      { ...receiver, receiverDeviceId: 'other' })).resources).toEqual([]);
  } finally { sqlite.close(); }
});
