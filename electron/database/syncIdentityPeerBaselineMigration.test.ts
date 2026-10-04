// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION,
  initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { canReuseSyncIdentityFactProof,
  loadSyncIdentityPeerBaseline,
  recordSyncIdentityPeerBaseline } from '../../lib/core/sync/syncIdentityPeerBaseline.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const localRoot = 'a'.repeat(64);
const peerRoot = 'b'.repeat(64);

function seedPair(db: Database.Database) {
  db.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    INSERT INTO sync_group_devices VALUES
      ('group', 'peer', 'anchor', '/library', 'Peer', 'mac', 'active',
       'now', NULL, NULL, 'now')`);
}

it('upgrades a completed 129 pair without treating its old timestamp as fact proof', async () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    seedPair(db);
    db.exec('DROP TABLE sync_identity_peer_baselines');
    db.exec(`CREATE TABLE sync_identity_peer_baselines (
      group_id TEXT NOT NULL, local_device_id TEXT NOT NULL, peer_device_id TEXT NOT NULL,
      local_epoch TEXT NOT NULL, peer_epoch TEXT NOT NULL,
      local_watermark TEXT NOT NULL, peer_watermark TEXT NOT NULL,
      local_view_id TEXT NOT NULL, peer_view_id TEXT NOT NULL, verified_at TEXT NOT NULL,
      PRIMARY KEY (group_id, local_device_id, peer_device_id))`);
    db.exec(`INSERT INTO sync_identity_peer_baselines VALUES
      ('group', 'local', 'peer', 'local-epoch', 'peer-epoch',
       'local-time', 'peer-time', 'local-view', 'peer-view', 'now')`);
    db.pragma('user_version = 129');
    initializeDatabaseSchema(db);
    expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    const port = createBetterSqliteDbPort(db);
    const pair = { groupId: 'group', localDeviceId: 'local', peerDeviceId: 'peer' };
    const legacy = await loadSyncIdentityPeerBaseline(port, pair);
    expect(legacy).toMatchObject({ localEpoch: 'local-epoch', peerEpoch: 'peer-epoch',
      localWatermark: 'local-time', peerWatermark: 'peer-time',
      localProofRoot: '', peerProofRoot: '', proofRevision: '' });
    expect(canReuseSyncIdentityFactProof(legacy, {
      localProofRoot: localRoot, peerProofRoot: peerRoot })).toBe(false);
    await recordSyncIdentityPeerBaseline(port, { ...pair, localEpoch: 'local-epoch',
      peerEpoch: 'peer-epoch', localWatermark: 'local-time', peerWatermark: 'peer-time',
      localViewId: 'local-view', peerViewId: 'peer-view',
      localProofRoot: localRoot, peerProofRoot: peerRoot });
    const completed = await loadSyncIdentityPeerBaseline(port, pair);
    expect(canReuseSyncIdentityFactProof(completed, {
      localProofRoot: localRoot, peerProofRoot: peerRoot })).toBe(true);
    expect(canReuseSyncIdentityFactProof(completed, {
      localProofRoot: peerRoot, peerProofRoot: localRoot })).toBe(false);
  } finally { db.close(); }
});
