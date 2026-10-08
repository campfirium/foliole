import { hexToBytes } from '@noble/hashes/utils.js';

import { FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA } from '../../lib/core/database/framedSyncResourceDemandSchema.js';
import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { projectFramedSyncResourceFact } from '../../lib/core/sync/framedSyncResourceFact.js';
import { factToWire, manifestToWire } from '../../lib/core/sync/framedSyncWireProjection.js';

import { verifiedCompanionFixture, type Kind } from './companionFramedSyncVerifiedApply.testSupport.js';

export async function companionResourceFixture(kind: Kind) {
  const host = await verifiedCompanionFixture(kind, '');
  const hash = 'a'.repeat(64), storageKey = `${hash}.png`;
  const context: FramedSyncContext = {
    groupId: 'resource-group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, ...host.input
  };
  const binding = { bodyHash: 'b'.repeat(64), demandId: 'demand', globalId: 'node-1',
    sharedStateHash: new Uint8Array(32).fill(3), versionId: 'version-1' };
  const fact = projectFramedSyncResourceFact(binding, { contentHash: hash, role: 2, storageKey }, 17n);
  const manifest = { facts: [fact], blobs: [...fact.blobs] };
  const contentId = await canonicalContentId(manifest), transferId = await canonicalTransferId(context, contentId);
  const input = { ...host.input, transferId, resourceStorageKeys: [storageKey] };
  const attemptId = new Uint8Array(16).fill(2), prefix = host.prefix;
  for (const suffix of ['frames', 'blob_pins', 'resource_pins', ...(kind === 'android' ? ['attempts'] : [])]) {
    host.native.prepare(`DELETE FROM ${prefix}_${suffix}`).run();
  }
  host.native.prepare(`DELETE FROM ${prefix}_transfers`).run();
  host.native.prepare(`INSERT INTO ${prefix}_transfers VALUES (?, ?, 1, 1, 17, ?, ?, ?, ?, ?, 'ready_to_apply')`)
    .run(transferId, contentId, input.senderDeviceId, input.senderLibraryEpoch,
      input.receiverDeviceId, input.receiverLibraryEpoch, attemptId);
  if (kind === 'android') host.native.prepare(`INSERT INTO ${prefix}_attempts VALUES (?, ?, 'promoted')`).run(transferId, attemptId);
  for (const [sequence, type, bytes] of [
    ['0', 2, encodeValidatedProtocolMessage('transfer_header', {
      transferId, attemptId, manifest: manifestToWire(manifest, context.groupId, contentId)
    })], ['1', 3, encodeValidatedProtocolMessage('fact', factToWire(fact))]
  ] as const) {
    host.native.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(transferId, attemptId, sequence, type, new Uint8Array(96), new Uint8Array(16), Uint8Array.of(1), bytes);
  }
  host.native.prepare(`INSERT INTO ${prefix}_available_resources VALUES (?, 17, ?)`).run(hexToBytes(hash), storageKey);
  host.native.prepare(`INSERT INTO ${prefix}_resource_pins VALUES (?, ?, 17, 2, 1, ?)`)
    .run(transferId, hexToBytes(hash), storageKey);
  host.main.exec(FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA);
  host.main.prepare(`INSERT INTO framed_sync_resource_demands
    (group_id, receiver_device_id, receiver_library_epoch, global_id, version_id,
      body_hash, storage_key, demand_id, request_started, shared_state_hash, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending')`)
    .run(context.groupId, input.receiverDeviceId, input.receiverLibraryEpoch, binding.globalId,
      binding.versionId, binding.bodyHash, storageKey, binding.demandId, fact.sharedStateHash);
  return { host, input, contentId, hash, storageKey };
}

export function resourceBusinessState(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents',
     'content_blobs'].map((table) => host.main.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}
