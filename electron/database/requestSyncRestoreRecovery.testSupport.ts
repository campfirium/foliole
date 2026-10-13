import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncOverwriteInventory, readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { runRequestSyncOverwriteRound } from '../../lib/core/sync/requestSyncOverwriteRound.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { prepareSyncGroupOverwrite, type SyncGroupOverwriteProgress } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch } from './topicTextState.testSupport.js';

export const time = '2026-09-27T12:00:00.000Z';
export async function restoreFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-request-restore-'));
  const peers: RestorePeer[] = [];
  return { root, peer(id: string) { const peer = new RestorePeer(root, id); peers.push(peer); return peer; },
    async close() { for (const peer of peers) peer.sqlite.close(); await rm(root, { recursive: true, force: true }); } };
}

export class RestorePeer {
  sqlite: Database.Database;
  readonly file: string;
  constructor(readonly root: string, readonly id: string) {
    this.file = path.join(root, `${id}.db`);
    this.sqlite = new Database(this.file);
    initializeDatabaseSchema(this.sqlite);
    this.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'secret', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'group', '${id}', 'active', 'now');
      UPDATE node_version_local_proof_state SET library_epoch = '${id}-epoch';`);
    for (const member of ['source', 'target', 'observer']) this.sqlite.prepare(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name, platform, state, joined_at, updated_at)
      VALUES ('group', ?, ?, ?, ?, 'desktop', 'active', 'now', 'now')`).run(member, member, `/${member}`, member);
  }
  get db() { return createBetterSqliteDbPort(this.sqlite); }
  get epoch() { return String(this.sqlite.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get()); }
  get host() { return { files: createDesktopFramedSyncFiles(path.join(this.root, this.id)),
    readSnapshot: <T>(read: (db: ReturnType<typeof createBetterSqliteDbPort>) => Promise<T>) => this.db.transaction(read),
    write: <T>(write: (db: ReturnType<typeof createBetterSqliteDbPort>) => Promise<T>) => write(this.db) }; }
  reopen() { this.sqlite.close(); this.sqlite = new Database(this.file); }
  async seed(id: string) {
    const base = textBranch(`${id}-base`, `Original ${id}😀`);
    const head = textBranch(`${id}-head`, `Current ${id}中文\0`, base);
    await applySyncNodesWithDbPort(this.db, [base, head].map(record => ({ ...record,
      object_id: id, snapshot: { ...record.snapshot, id } })));
  }
}

export function event(source: RestorePeer, id: string, restoredAt = time) {
  return { group_id: 'group', restore_id: id, restored_at: restoredAt, source_device_identity_key: source.id };
}
export async function prepare(source: RestorePeer, target: RestorePeer, id: string, restoredAt = time) {
  await receiveSyncGroupRestoreEvent(target.db, event(source, id, restoredAt));
  const progress = { groupId: 'group', overwriteId: id, providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: id };
  await prepareSyncGroupOverwrite(target.db, progress);
  return progress;
}

export function context(progress: SyncGroupOverwriteProgress) {
  return { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch,
    receiverDeviceId: progress.receiverDeviceId, receiverLibraryEpoch: progress.receiverLibraryEpoch } as const;
}

export async function transfer(source: RestorePeer, target: RestorePeer, progress: SyncGroupOverwriteProgress,
  difference: FramedSyncInventoryDifference, enqueueSearchInvalidations = true) {
  await withRequestSyncFiles(source.host.files, async request => {
    await writeRequestSyncSnapshot(source.db, { ...difference, direction: 'local_to_remote' }, request);
    await applyRequestSyncObject(target.db, { context: context(progress),
      peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
        library_epoch: progress.providerLibraryEpoch, proof_revision: 0, source_proof_revisions: {},
        devices: [], removals: [], restore: null }, objectType: difference.objectType, globalId: difference.globalId,
      requestId: new Uint8Array(16), enqueueSearchInvalidations, facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob) });
  });
}

export function round(source: RestorePeer, target: RestorePeer, progress: SyncGroupOverwriteProgress,
  afterObject?: () => void) {
  return runRequestSyncOverwriteRound(target.host, progress, {
    exchangeInventory: async () => ({ local: await readFramedSyncOverwriteInventory(target.db, context(progress)),
      remote: await readRequestSyncInventorySnapshot(source.db) }),
    transferObjects: async differences => {
      const results = [];
      for (const difference of differences) {
        await transfer(source, target, progress, difference);
        afterObject?.();
        results.push({ requestId: new Uint8Array(16), objectType: difference.objectType, globalId: difference.globalId, error: '' });
      }
      return results;
    }, reportObjectError: (_difference, error) => { throw error; }
  });
}

export function originals(peer: RestorePeer) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents'].map(table =>
    peer.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}
export function ids(peer: RestorePeer) {
  return peer.sqlite.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY id").all();
}
