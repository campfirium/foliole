import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { applyDesktopSyncGroupMemberState, loadDesktopSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));

const databases: Database.Database[] = [];
const [local, peer] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
  .map((deviceAnchor, index) => createSyncGroupDeviceIdentity({
    device_anchor: deviceAnchor, group_id: 'group-1', library_path: `/library/${index}`, path_flavor: 'posix'
  })) as [ReturnType<typeof createSyncGroupDeviceIdentity>, ReturnType<typeof createSyncGroupDeviceIdentity>];
const roundAt = '2026-10-21T05:37:00.000Z';

afterEach(() => databases.splice(0).forEach((database) => database.close()));

it('keeps syncing with a peer that lost its last acknowledged commits in a crash', () => {
  const source = sourceKnowingPeerAt(7);
  const lost = peerStateAcknowledging(6, '2026-10-21T05:20:00.000Z');
  use(source);
  expect(() => applyDesktopSyncGroupMemberState(lost, peer.identity_key)).not.toThrow();
  expect(source.prepare(`SELECT proof_revision FROM node_version_device_revisions
    WHERE device_identity_key = ?`).pluck().get(peer.identity_key)).toBe(6);
  expect(() => applyDesktopSyncGroupMemberState(lost, peer.identity_key)).not.toThrow();
});

it('rejects a peer restored from a copy older than the group line margin', () => {
  const source = sourceKnowingPeerAt(7);
  const restored = peerStateAcknowledging(6, '2026-10-18T05:37:00.000Z');
  use(source);
  expect(() => applyDesktopSyncGroupMemberState(restored, peer.identity_key))
    .toThrow('node_version_peer_restore_requires_rejoin');
  const withoutCoverage: SyncGroupMemberStatePayload = { ...restored };
  delete withoutCoverage.coverage;
  expect(() => applyDesktopSyncGroupMemberState(withoutCoverage, peer.identity_key))
    .toThrow('node_version_peer_restore_requires_rejoin');
});

function sourceKnowingPeerAt(revision: number) {
  const source = deviceDatabase(local, peer);
  source.prepare(`INSERT INTO node_version_device_revisions
    (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
    VALUES ('group-1', ?, 'peer-epoch', ?, 'pack', 'now')`).run(peer.identity_key, revision);
  source.prepare(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, 'now')`)
    .run('sync_group_coverage:group-1', JSON.stringify({ basis: '', cells: {
      [local.identity_key]: { [peer.identity_key]: roundAt },
      [peer.identity_key]: { [local.identity_key]: roundAt }
    } }));
  return source;
}

/** What the peer reports after reopening: same epoch, fewer acknowledged commits, its durable coverage. */
function peerStateAcknowledging(revision: number, durableRoundAt: string) {
  use(deviceDatabase(peer, local));
  const state = loadDesktopSyncGroupMemberState();
  return { ...state, library_epoch: 'peer-epoch', proof_revision: 100,
    source_proof_revisions: { [local.identity_key]: revision },
    coverage: { basis: '', cells: {
      [peer.identity_key]: { [local.identity_key]: durableRoundAt },
      [local.identity_key]: { [peer.identity_key]: durableRoundAt }
    } } };
}

function deviceDatabase(self: typeof local, other: typeof local) {
  const database = new Database(':memory:');
  databases.push(database);
  initializeDatabaseSchema(database);
  use(database);
  createDesktopSyncGroup({ device: self, deviceName: 'self', platform: 'desktop',
    workgroupKey: Buffer.alloc(32, 4).toString('base64url') });
  registerSyncGroupDevice({ device: other, deviceName: 'other', platform: 'desktop' });
  return database;
}

function use(database: Database.Database) {
  connection.current = { driver: createBetterSqlite3Driver(database) };
}
