import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { requestSyncBatchEnd } from '../../lib/core/sync/requestSyncBatchContract.js';
import { receiveRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchReceiver.js';
import type { RequestSyncBatchSelection } from '../../lib/core/sync/requestSyncBatchSnapshot.js';
import { RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { requestSyncObjectMessages, type RequestSyncMessage } from '../../lib/core/sync/requestSyncObjectMessages.js';
import { prepareRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { createDesktopRequestSyncFiles } from '../sync/desktopRequestSyncFiles.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

export const batchId = new Uint8Array(16).fill(255);
export const groupKey = new Uint8Array(32).fill(7);
export const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'peer', initiatorLibraryEpoch: 'peer-epoch',
  responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } as const;
export const peerState: SyncGroupMemberStatePayload = { contract_version: 3, group_id: 'group',
  sender_device_identity_key: 'peer', library_epoch: 'peer-epoch', proof_revision: 0,
  source_proof_revisions: {}, devices: [], removals: [], restore: null };

export function batchRecord(globalId: string, body: string, parent?: NativeSyncNodeRecord) {
  const record = textBranch(`version-${globalId}`, body, parent);
  return { ...record, object_id: globalId, snapshot: { ...record.snapshot, id: globalId } };
}

export async function batchFixture() {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/request-sync-batch-'));
  const device = textDevice();
  let snapshotActive = false;
  let snapshots = 0;
  const host: RequestSyncDatabaseHost = {
    files: createDesktopRequestSyncFiles(path.join(root, 'database', 'test.db')),
    enqueueSearchInvalidations: false,
    async readSnapshot(read) {
      snapshotActive = true; snapshots++;
      try { return await device.db.transaction(read); }
      finally { snapshotActive = false; }
    },
    write: write => write(device.db)
  };
  return { device, host, root, get snapshotActive() { return snapshotActive; }, get snapshots() { return snapshots; },
    async close() { device.sqlite.close(); await rm(root, { recursive: true, force: true }); } };
}

export function activateBatchReceiver(fixture: Awaited<ReturnType<typeof batchFixture>>) {
  fixture.device.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    UPDATE node_version_local_proof_state SET library_epoch = 'local-epoch';
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'peer', 'peer-anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
      ('group', 'local', 'local-anchor', '/local', 'Local', 'mac', 'active', 'now', 'now')`);
}

export async function batchSelections(fixture: Awaited<ReturnType<typeof batchFixture>>,
  records: readonly NativeSyncNodeRecord[]): Promise<RequestSyncBatchSelection[]> {
  await fixture.device.receive([...records]);
  return Promise.all(records.map(async (record, index) => {
    const entry = await readFramedSyncInventoryEntry(fixture.device.db, { objectType: 'node', globalId: record.object_id });
    if (!entry) throw new Error('test_entry_missing');
    const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
    if (!difference) throw new Error('test_difference_missing');
    return { objectType: entry.objectType, globalId: entry.globalId,
      requestId: new Uint8Array(16).fill(index + 1), resolve: async () => difference };
  }));
}

export async function transferReceivedBatch(fixture: Awaited<ReturnType<typeof batchFixture>>, records: NativeSyncNodeRecord[],
  options: { truncate?: boolean; wrongId?: boolean; wrongObjectId?: boolean; wrongGlobalId?: boolean; truncateSecond?: boolean;
    duplicate?: boolean; selection?: 'missing' | 'extra' | 'duplicate' | 'exact'; legacy?: boolean } = {}) {
  const files = records.map(() => new RequestSyncFiles(fixture.host.files, `requests/${crypto.randomUUID()}`));
  const identities = records.map((record, i) => ({ requestId: new Uint8Array(16).fill(i + 1), objectType: 'node', globalId: record.object_id }));
  try {
    const headers = await Promise.all(records.map(async (record, i) => {
      const projection = projectFramedSyncNodeRecord(record);
      const file = files[i]!;
      const fact = projection.manifest.facts[0]!;
      for (const blob of fact.blobs) await file.writeBody(blob, projection.bodyBlob);
      await file.writeFact(fact);
      if (options.selection === 'duplicate') await file.writeFact(fact);
      return { ...identities[i]!, currentVersionId: record.version_id ?? '', sourceStateHash: fact.sharedStateHash };
    }));
    const wire = await prepareRequestSyncWire({ context, groupKey, messages: async function* (contextId): AsyncGenerator<RequestSyncMessage> {
      for (const [i, header] of headers.entries()) {
        for await (const message of requestSyncObjectMessages(header, contextId, files[i]!)) {
          yield message;
          if (options.truncateSecond && i === 1 && message.payloadCase === 'blob_chunk') return;
        }
        if (options.duplicate) yield* requestSyncObjectMessages(header, contextId, files[i]!);
      }
      if (!options.truncate) yield requestSyncBatchEnd(batchId, records.length);
    } });
    if (options.legacy) new DataView(wire.preamble.buffer, wire.preamble.byteOffset).setUint16(10, 25);
    const expected = identities.map((identity, index) => ({ ...identity,
      ...(options.selection ? { need: { frontierFactIds: options.selection === 'extra' ? [] :
        [records[index]!.version_id!, ...(options.selection === 'missing' ? ['missing-version'] : [])],
      requiredRelationIds: [], reviewFactIds: [], stateFactIds: [], resourceHashes: [], sharedState: true } } : {}) }));
    return await receiveRequestSyncBatch(fixture.host, { ...wire, context, groupKey, peerState,
      author: 'initiator', requestId: options.wrongId ? new Uint8Array(16).fill(99) : batchId,
      expected: options.wrongObjectId ? identities.map(identity => ({ ...identity, requestId: new Uint8Array(16).fill(99) })) : options.wrongGlobalId ? identities.map(identity => ({ ...identity, globalId: 'another-object' })) : expected });
  } finally { await Promise.all(files.map(file => file.close())); }
}
