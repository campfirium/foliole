// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: appData,
  app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_log_dir: path.join(appData, 'logs') }) }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => appData, isPackaged: false } }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { receiveRequestSyncObject, sendRequestSyncObject } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { buildResolutionRecord } from '../../lib/core/sync/syncNodeResolution.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';

let root = '';
let source: RestorePeer;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-dirty-node-request-'));
  appData = path.join(root, 'target');
  initializeDatabaseConnection(openDatabaseConnection());
  source = new RestorePeer(root, 'source');
  const db = openDatabaseConnection().sqlite;
  db.exec(`INSERT INTO settings (key,value,updated_at) VALUES ('host_name','"target"','now');
    INSERT INTO sync_groups VALUES ('group','Group','secret','now','now');
    INSERT INTO sync_group_local_state VALUES (1,'group','target','active','now');
    UPDATE node_version_local_proof_state SET library_epoch='target-epoch';`);
  for (const member of ['source', 'target']) db.prepare(`INSERT INTO sync_group_devices
    (group_id,device_identity_key,device_anchor,canonical_library_path,device_name,platform,state,joined_at,updated_at)
    VALUES ('group',?,?,?,?,'desktop','active','now','now')`).run(member, member, `/${member}`, member);
});
afterEach(async () => {
  source.sqlite.close();
  closeDatabaseConnection();
  await rm(root, { recursive: true, force: true });
});

async function seed(dirty: boolean) {
  const base = textBranch('base', 'Child body', undefined, '2026-10-01T00:00:00Z');
  const parent = textBranch('parent-v1', 'Alpha Beta Gamma');
  parent.object_id = 'parent'; parent.snapshot.id = 'parent';
  if (dirty) {
    base.snapshot.parent_id = 'parent';
    base.snapshot.anchor_link = JSON.stringify({ id: 'anchor', kind: 'highlight',
      locator: { from: 6, to: 10, originalText: 'Beta' } });
  }
  const local = textBranch('local-child', 'Child body', base, '2026-10-02T00:00:00Z');
  const other = textBranch('other-child', 'Child body', base, '2026-10-03T00:00:00Z');
  for (const branch of [local, other]) {
    branch.snapshot.parent_id = base.snapshot.parent_id;
    branch.snapshot.anchor_link = base.snapshot.anchor_link;
  }
  const merged = buildResolutionRecord([local, other], other, 'Child body');
  const target = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  for (const port of [target, source.db]) await applySyncNodesWithDbPort(port, [parent]);
  await applySyncNodesWithDbPort(target, [base, local]);
  await applySyncNodesWithDbPort(source.db, [base, local, other, merged]);
  if (dirty) {
    const next = textBranch('parent-v2', 'Prefix Alpha Beta Gamma', parent);
    next.object_id = 'parent'; next.snapshot.id = 'parent';
    await applySyncNodesWithDbPort(target, [next]);
    expect(openDatabaseConnection().sqlite.prepare('SELECT sync_dirty FROM nodes WHERE id=?').pluck().get('topic')).toBe(1);
  }
  return { local, merged };
}

async function deliver(prepareInventory = true) {
  const host = createDesktopRequestSyncDatabaseHost(openDatabaseConnection().dbPath);
  const local = await readRequestSyncInventorySnapshot(source.db);
  const remote = prepareInventory ? await host.readSnapshot(readRequestSyncInventorySnapshot)
    : await readRequestSyncInventorySnapshot(createBetterSqliteDbPort(openDatabaseConnection().sqlite));
  const difference = compareFramedSyncInventories({ local, remote })
    .find(value => value.direction === 'local_to_remote' && value.globalId === 'topic')!;
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'source', initiatorLibraryEpoch: 'source-epoch',
    responderDeviceId: 'target', responderLibraryEpoch: 'target-epoch' } as const;
  const groupKey = new Uint8Array(32).fill(7);
  return sendRequestSyncObject(source.host, { context, difference, groupKey }, stream =>
    receiveRequestSyncObject(host, { ...stream, context, groupKey, author: 'initiator', expectedObject: difference,
      peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: 'source',
        library_epoch: 'source-epoch', proof_revision: 0, source_proof_revisions: {},
        devices: [], removals: [], restore: null } }));
}

it('accepts an incoming descendant when the local projection is clean', async () => {
  const { merged } = await seed(false);
  await deliver();
  const current = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(openDatabaseConnection().sqlite), 'topic');
  expect(current?.version_id).toBe(merged.version_id);
  expect(current?.body_text).toBe('Child body');
});

it.each([true, false])('retains a parent-driven child anchor repair with inventory preparation=%s', async prepareInventory => {
  const { local, merged } = await seed(true);
  await deliver(prepareInventory);
  const connection = openDatabaseConnection();
  const current = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(connection.sqlite), 'topic');
  expect(current?.body_text).toBe('Child body');
  expect(current?.ancestor_version_ids).toEqual(expect.arrayContaining([local.version_id, merged.version_id]));
  expect(connection.sqlite.prepare(`SELECT snapshot_json FROM node_sync_versions
    WHERE object_id='topic' AND json_extract(snapshot_json,'$.anchor_source_version_id')='parent-v2'`).all())
    .not.toEqual([]);
  expect(connection.sqlite.prepare("SELECT sync_dirty FROM nodes WHERE id='topic'").pluck().get()).toBe(0);
});


it('rolls back prepared local versions together with a rejected incoming write', async () => {
  const { local } = await seed(true);
  const connection = openDatabaseConnection();
  const versions = connection.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  await expect(host.write(async () => { throw new Error('rejected_incoming'); })).rejects.toThrow('rejected_incoming');
  expect(connection.sqlite.prepare("SELECT current_version_id,sync_dirty FROM nodes WHERE id='topic'").get())
    .toEqual({ current_version_id: local.version_id, sync_dirty: 1 });
  expect(connection.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
});

it('does not publish pending local changes while adopting another library', async () => {
  const { local } = await seed(true);
  const connection = openDatabaseConnection();
  await beginSyncGroupLocalAdoption(createBetterSqliteDbPort(connection.sqlite), {
    endpointUrl: 'http://127.0.0.1:1234', groupId: 'group', libraryEpoch: 'adopting',
    providerDeviceId: 'source', providerDeviceName: 'Source', providerPlatform: 'desktop'
  });
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  expect(await host.readSnapshot(db => db.query("SELECT current_version_id,sync_dirty FROM nodes WHERE id='topic'")))
    .toEqual([{ current_version_id: local.version_id, sync_dirty: 1 }]);
});
