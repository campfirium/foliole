
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import type { SyncGroupOverwriteProgress } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

export const adoption = { endpointUrl: 'http://localhost:38641', groupId: 'group-1',
  libraryEpoch: 'receiver-epoch', providerDeviceId: 'sender', providerDeviceName: 'Sender', providerPlatform: 'darwin' };
export const progress: SyncGroupOverwriteProgress = { groupId: adoption.groupId, overwriteId: adoption.libraryEpoch,
  providerDeviceId: adoption.providerDeviceId, providerLibraryEpoch: 'sender-epoch',
  receiverDeviceId: 'receiver', receiverLibraryEpoch: adoption.libraryEpoch };
export const context = { groupId: progress.groupId, protocolVersion: 24,
  receiverDeviceId: progress.receiverDeviceId, receiverLibraryEpoch: progress.receiverLibraryEpoch,
  senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch } as const;
const body = '\ufeffOld library 中文😀\0';

export async function overwriteFixture(mode: 'adoption' | 'restore' = 'adoption') {
  const host = await currentFixture();
  try {
    const original = textBranch('version-1', body);
    const record = { ...original, object_id: 'node-1', snapshot: { ...original.snapshot, id: 'node-1' } };
    const supplement = () => host.port().transaction(tx => applySyncNodesWithDbPort(tx, [record],
      { operation: 'local_restore', enqueueSearchInvalidations: false }));
    await supplement();
    if (mode === 'adoption') await beginSyncGroupLocalAdoption(host.port(), adoption);
    else {
      await host.port().run('INSERT INTO sync_groups VALUES (?, ?, ?, ?, ?)',
        [progress.groupId, 'Group', 'key', '2026-10-05', '2026-10-05']);
      await receiveSyncGroupRestoreEvent(host.port(), { group_id: progress.groupId,
        restore_id: progress.overwriteId, source_device_identity_key: progress.providerDeviceId,
        restored_at: '2026-10-05T01:00:00.000Z' });
    }
    return { host, supplement };
  } catch (error) { host.close(); throw error; }
}

export function overwriteBusinessState(host: Awaited<ReturnType<typeof overwriteFixture>>['host']) {
  return Object.fromEntries(['nodes', 'node_sync_versions', 'node_sync_version_parents',
    'sync_object_state', 'content_blobs', 'sync_group_metadata',
    'node_version_local_proof_state', 'sync_state_sequence'].map((table) =>
    [table, host.main.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

async function currentFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-overwrite-progress-'));
  const file = path.join(root, 'main.sqlite');
  let main = new Database(file);
  await bootstrapCompanionDatabase(createBetterSqliteDbPort(main), {
    allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06'
  });
  main.exec('DELETE FROM nodes');
  return { get main() { return main; }, port: () => createBetterSqliteDbPort(main),
    reopen() { main.close(); main = new Database(file); },
    close() { main.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}
