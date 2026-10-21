// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { createDesktopRequestSyncExchange } from '../../electron/sync/desktopRequestSyncExchange.js';
import { branch } from '../../electron/sync/syncPackStoredVersionDependencies.testSupport.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';
import { exchangeRequestSyncInventory, pullRequestSyncObject, pushRequestSyncObject } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { createCompanionRequestFixture, native } from './companionRequestSync.testSupport';

it('keeps equal unready libraries pending without object streams, then repairs the available current body', async (context) => {
  const started = performance.now();
  const stages: Record<string, number> = { creating: 0 };
  context.onTestFailed(() => console.error('[equal-unready-failure]', {
    stages, elapsedMs: performance.now() - started
  }));
  const host = await createCompanionRequestFixture();
  const nodeId = 'equal-unready';
  try {
    await host.fixture.left.seed({ nodeId, title: 'Incomplete', content: 'Retained current' });
    stages.initialSync = performance.now() - started;
    await host.sync();
    const target = new Database(host.fixture.rightSnapshot.databasePath);
    try {
      for (const db of [host.sqlite, target]) db.prepare(`UPDATE node_sync_versions SET body_text = NULL,
        snapshot_json = json_set(snapshot_json, '$.content', NULL)
        WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)`).run(nodeId);
      const objectRequests: string[] = [];
      native.post.mockImplementation(async input => {
        const kind = new URL(input.url).searchParams.get('request');
        if (kind && ['pull', 'pulls', 'object', 'objects'].includes(kind)) objectRequests.push(kind);
        return host.post(input);
      });
      for (let pass = 0; pass < 3; pass++) {
        stages[`unreadyRound${pass}`] = performance.now() - started;
        expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 1, madeDatabaseProgress: false });
      }
      expect(objectRequests).toEqual([]);
      target.prepare(`UPDATE node_sync_versions SET body_text = 'Retained current',
        snapshot_json = json_set(snapshot_json, '$.content', 'Retained current')
        WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)`).run(nodeId);
      stages.repairSync = performance.now() - started;
      expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
      expect(objectRequests).toContain('pulls');
      expect(host.sqlite.prepare(`SELECT body_text FROM node_sync_versions
        WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)`).pluck().get(nodeId)).toBe('Retained current');
    } finally { target.close(); }
  } finally { await host.close(); }
}, 60000);

it('converges different current references using already stored versions without transmitting a version fact', async () => {
  const host = await createCompanionRequestFixture();
  const target = new Database(host.fixture.rightSnapshot.databasePath);
  const versions = [branch('base', 'Original')];
  versions.push(branch('next', 'Current', versions[0]));
  try {
    for (const db of [host.sqlite, target]) await applySyncNodesWithDbPort(createBetterSqliteDbPort(db), versions);
    host.sqlite.prepare("UPDATE nodes SET current_version_id = 'base', content = 'Original', sync_dirty = 0 WHERE id = 'node-1'").run();
    host.sqlite.prepare("UPDATE sync_object_state SET current_version_id = 'base', content_hash = ? WHERE object_id = 'node-1'")
      .run(versions[0]!.content_hash);
    const received: string[] = [];
    const original = RequestSyncFiles.prototype.writeDecodedFact;
    const spy = vi.spyOn(RequestSyncFiles.prototype, 'writeDecodedFact').mockImplementation(async function(this: RequestSyncFiles, message) {
      const fact = canonicalFactFromValidatedMessage(message);
      if (fact.kind === 2 && fact.blobs.length) received.push(fact.factId);
      return original.call(this, message);
    });
    try {
      expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
      expect(received).toEqual([]);
      expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('Current');
      expect(target.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('next');
      await host.restart();
      expect(host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('next');
      expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    } finally { spy.mockRestore(); }
  } finally { target.close(); await host.close(); }
}, 60000);

it.each([false, true])('converges stored concurrent heads after any local blocker clears: dirty=%s', async dirty => {
  const host = await createCompanionRequestFixture();
  const target = new Database(host.fixture.rightSnapshot.databasePath);
  const versions = [branch('left-head', 'Left branch'), branch('right-head', 'Right branch')];
  try {
    for (const db of [host.sqlite, target]) await applySyncNodesWithDbPort(createBetterSqliteDbPort(db), versions);
    target.prepare("UPDATE nodes SET current_version_id = 'right-head', content = 'Right branch', sync_dirty = 0 WHERE id = 'node-1'").run();
    target.prepare("UPDATE sync_object_state SET current_version_id = 'right-head', content_hash = ? WHERE object_id = 'node-1'")
      .run(versions[1]!.content_hash);
    if (dirty) {
      for (const db of [host.sqlite, target]) db.prepare("UPDATE nodes SET sync_dirty = 1 WHERE id = 'node-1'").run();
      await expect(host.sync()).rejects.toThrow('sync_node_apply_blocked');
      for (const db of [host.sqlite, target]) db.prepare("UPDATE nodes SET sync_dirty = 0 WHERE id = 'node-1'").run();
    }
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    const state = (db: Database.Database) => db.prepare(
      "SELECT current_version_id, content FROM nodes WHERE id = 'node-1'").get();
    expect(state(host.sqlite)).toEqual(state(target));
    const counts = [host.sqlite, target].map(db => db.prepare('SELECT count(*) FROM node_sync_versions').pluck().get());
    for (let round = 0; round < 3; round++) {
      expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
      expect(state(host.sqlite)).toEqual(state(target));
      expect([host.sqlite, target].map(db => db.prepare('SELECT count(*) FROM node_sync_versions').pluck().get())).toEqual(counts);
    }
  } finally { target.close(); await host.close(); }
}, 60000);

it.each(['push', 'pull'])('uses an empty authenticated single-object stream for known current versions: %s', async direction => {
  const host = await createCompanionRequestFixture();
  const target = new Database(host.fixture.rightSnapshot.databasePath);
  const base = branch('single-base', 'Original');
  const next = branch('single-next', 'Current', base);
  try {
    for (const db of [host.sqlite, target]) await applySyncNodesWithDbPort(createBetterSqliteDbPort(db), [base, next]);
    host.sqlite.prepare("UPDATE nodes SET current_version_id = 'single-base', content = 'Original', sync_dirty = 0 WHERE id = 'node-1'").run();
    host.sqlite.prepare("UPDATE sync_object_state SET current_version_id = 'single-base', content_hash = ? WHERE object_id = 'node-1'")
      .run(base.content_hash);
    const local = host.fixture.leftSnapshot;
    const remote = host.fixture.rightSnapshot;
    const database = { files: native.files!,
      readSnapshot: <T>(read: (db: typeof host.db) => Promise<T>) => host.db.transaction(read),
      write: <T>(write: (db: typeof host.db) => Promise<T>) => write(host.db) };
    const exchange = createDesktopRequestSyncExchange({ endpointUrl: remote.origin,
      groupSecret: Buffer.alloc(32, 7).toString('base64url'), groupKey: new Uint8Array(32).fill(7),
      context: { groupId: 't326-group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
        initiatorDeviceId: local.deviceId, initiatorLibraryEpoch: `${local.deviceId}-epoch`,
        responderDeviceId: remote.deviceId, responderLibraryEpoch: `${remote.deviceId}-epoch` } });
    const differences = compareFramedSyncDatabaseInventories(await exchangeRequestSyncInventory(database, exchange));
    const push = differences.find(value => value.direction === 'local_to_remote' && value.globalId === 'node-1')!;
    const pull = differences.find(value => value.direction === 'remote_to_local' && value.globalId === 'node-1')!;
    expect(push.need.frontierFactIds).toEqual([]);
    expect(pull.need.frontierFactIds).toEqual([]);
    const bodies = vi.spyOn(RequestSyncFiles.prototype, 'writeBody');
    try {
      if (direction === 'push') await pushRequestSyncObject(database, exchange, push);
      else await pullRequestSyncObject(database, exchange, pull, { peerState: {
      contract_version: 3, group_id: 't326-group', sender_device_identity_key: remote.deviceId,
      library_epoch: `${remote.deviceId}-epoch`, proof_revision: 0, source_proof_revisions: {},
      devices: [], removals: [], restore: null
    } });
      expect(bodies).not.toHaveBeenCalled();
    } finally { bodies.mockRestore(); }
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('single-next');
  } finally { target.close(); await host.close(); }
}, 60000);

it('defers a historical parent gap until the node changes and then restores the edge', async () => {
  const host = await createCompanionRequestFixture();
  const target = new Database(host.fixture.rightSnapshot.databasePath);
  const base = branch('edge-base', 'Original');
  const next = branch('edge-next', 'Current', base);
  const facts = vi.spyOn(RequestSyncFiles.prototype, 'writeFact');
  const decoded = vi.spyOn(RequestSyncFiles.prototype, 'writeDecodedFact');
  try {
    for (const db of [host.sqlite, target]) await applySyncNodesWithDbPort(createBetterSqliteDbPort(db), [base, next]);
    target.prepare('DELETE FROM node_sync_version_parents WHERE version_id = ?').run('edge-next');
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    const full = [...facts.mock.calls.map(([fact]) => fact), ...decoded.mock.calls.map(([message]) => canonicalFactFromValidatedMessage(message))]
      .filter(fact => fact.kind === 2 && fact.blobs.length);
    expect(full).toEqual([]);
    expect(target.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?').pluck().get('edge-next')).toBeUndefined();
    expect(target.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('edge-next');
    await applySyncNodesWithDbPort(host.db, [branch('edge-third', 'Changed again', next)]);
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(target.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?').pluck().get('edge-next')).toBe('edge-base');
    expect(target.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('edge-third');
    expect(target.prepare("SELECT content FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('Changed again');
  } finally { facts.mockRestore(); decoded.mockRestore(); target.close(); await host.close(); }
}, 60000);
