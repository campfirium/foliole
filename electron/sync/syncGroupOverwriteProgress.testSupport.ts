import { restoreFramedSyncNodeMetadata } from '../../lib/core/sync/framedSyncNodeRestore.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import type { SyncGroupOverwriteProgress } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { verifiedCompanionFixture } from './companionFramedSyncVerifiedApply.testSupport.js';

export const adoption = { endpointUrl: 'http://localhost:38641', groupId: 'group-1',
  libraryEpoch: 'receiver-epoch', providerDeviceId: 'sender', providerDeviceName: 'Sender', providerPlatform: 'darwin' };
export const progress: SyncGroupOverwriteProgress = { groupId: adoption.groupId, overwriteId: adoption.libraryEpoch,
  providerDeviceId: adoption.providerDeviceId, providerLibraryEpoch: 'sender-epoch',
  receiverDeviceId: 'receiver', receiverLibraryEpoch: adoption.libraryEpoch };
export const context = { groupId: progress.groupId, protocolVersion: 22,
  receiverDeviceId: progress.receiverDeviceId, receiverLibraryEpoch: progress.receiverLibraryEpoch,
  senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch } as const;
const body = '\ufeffOld library 中文😀\0';

export async function overwriteFixture(mode: 'adoption' | 'restore' = 'adoption') {
  const host = await verifiedCompanionFixture('android', body);
  try {
    const frame = host.native.prepare<[], { authenticated_plaintext: Uint8Array }>(
      `SELECT authenticated_plaintext FROM ${host.prefix}_frames WHERE frame_type = 3`).get();
    if (!frame) throw new Error('fixture_fact_missing');
    const fact = canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(frame.authenticated_plaintext, 3));
    const supplement = () => host.port().transaction(async (tx) => {
      const metadata = restoreFramedSyncNodeMetadata(fact);
      await applySyncNodesWithDbPort(tx, [{ ...metadata, body_text: body,
        snapshot: { ...metadata.snapshot, content: body } }],
      { operation: 'local_restore', enqueueSearchInvalidations: false });
    });
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
