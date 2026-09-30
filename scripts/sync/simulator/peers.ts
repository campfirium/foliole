import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { migrateDesktopHostProfile } from '../../../electron/database/hostProfile.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from '../../../electron/database/syncGroupStore.js';
import { markDesktopSyncGroupMemberStateReady } from '../../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import { initializeDatabaseSchema } from '../../../lib/core/database/migrations.js';
import { createSyncGroupDeviceIdentity } from '../../../lib/platform/syncGroupUnifiedContract.js';

import { inPeer, type SimulatorPeer } from './scope.js';

export const secret = Buffer.alloc(32, 7).toString('base64url');
export function openPeer(root: string, name: string, seed: string): SimulatorPeer {
  const folder = path.join(root, name);
  mkdirSync(path.join(folder, 'assets'), { recursive: true });
  const dbPath = path.join(folder, 'foliole.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  initializeDatabaseSchema(sqlite);
  const searchDbPath = path.join(folder, 'search.db');
  sqlite.prepare('ATTACH DATABASE ? AS search').run(searchDbPath);
  const digest = createHash('sha256').update(`${seed}:${name}`).digest('hex');
  const anchor = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
  const identity = createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group',
    library_path: dbPath, path_flavor: 'posix' });
  const peer = { sqlite, driver: createBetterSqlite3Driver(sqlite), dbPath, searchDbPath,
    name, id: identity.identity_key, anchor, assets: path.join(folder, 'assets'), root: folder };
  if (!sqlite.prepare("SELECT 1 FROM settings WHERE key='host_name'").get()) migrateDesktopHostProfile(peer, name);
  sqlite.exec('CREATE TABLE IF NOT EXISTS companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  sqlite.prepare("INSERT OR REPLACE INTO companion_meta VALUES ('host_name', ?)").run(name);
  return peer;
}

export function pairPeers(peers: SimulatorPeer[]) {
  for (const peer of peers) inPeer(peer, () => {
    // Replace only isolated host pairing state; never rewrite content/history identities.
    peer.sqlite.exec('DELETE FROM sync_group_local_state; DELETE FROM sync_group_devices; DELETE FROM sync_groups; DELETE FROM sync_group_nonce_ledger');
    const identity = (member: SimulatorPeer) => createSyncGroupDeviceIdentity({
      device_anchor: member.anchor, group_id: 'group', library_path: member.dbPath, path_flavor: 'posix' });
    createDesktopSyncGroup({ device: identity(peer), deviceName: peer.name,
      platform: 'mac', workgroupKey: secret });
    for (const member of peers) {
      registerSyncGroupDevice({ device: identity(member), deviceName: member.name, platform: 'mac' });
      markDesktopSyncGroupMemberStateReady(member.id);
    }
  });
}

export function reopenPeer(peer: SimulatorPeer) {
  peer.sqlite.close();
  const reopened = openPeer(path.dirname(peer.root), peer.name, process.env.FOLIOLE_SIM_SEED ?? '1');
  Object.assign(peer, reopened);
}
