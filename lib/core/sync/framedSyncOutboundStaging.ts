import {
  encodeFramedSyncManifest,
  failFramedSync,
  framedSyncBytes,
  readFramedSyncPublication,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import {
  commitFramedSyncFrame,
  finalizeFramedSyncAttempt,
  loadReplayableFramedSyncFrames,
  persistFramedSyncAttempt
} from './framedSyncAttemptStaging.js';
import type { PreparedTransferAttempt, StoredEncryptedFrame } from './framedSyncContract.js';
import { assertOutboundPublication, type OutboundPublishInput } from './framedSyncStagingContract.js';

export async function publishFramedSyncOutboundWithDbPort(db: DbPort, input: OutboundPublishInput) {
  const verified = await assertOutboundPublication(input);
  const prior = await readFramedSyncRow(db,
    'SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?', [input.transferId]);
  if (prior) return sameFramedSyncBytes(framedSyncBytes(prior, 'content_id'), input.contentId) &&
    sameFramedSyncBytes(framedSyncBytes(prior, 'canonical_manifest'), verified.canonicalBytes)
    ? 'identical' as const : failFramedSync('outbound_publication_conflict');
  const context = input.context;
  await db.run(`INSERT INTO framed_sync_outbound_publications VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`, [input.transferId, input.contentId,
    input.manifestHash, verified.canonicalBytes, encodeFramedSyncManifest(input.manifest),
    context.protocolVersion, context.groupId, context.senderDeviceId, context.senderLibraryEpoch,
    context.receiverDeviceId, context.receiverLibraryEpoch, input.manifest.facts.length,
    input.manifest.blobs.length, input.manifest.blobs.reduce((sum, blob) => sum + blob.byteLength, 0n)]);
  for (const fact of input.manifest.facts) await db.run(
    'INSERT INTO framed_sync_outbound_fact_refs VALUES (?, ?, ?, ?, ?)',
    [input.transferId, fact.kind, fact.objectType, fact.globalId, fact.factId]);
  for (const blob of input.manifest.blobs) await db.run(
    'INSERT INTO framed_sync_outbound_blob_refs VALUES (?, ?, ?, ?, ?)',
    [input.transferId, blob.sha256, blob.byteLength, blob.role, blob.required ? 1 : 0]);
  await db.run('INSERT INTO framed_sync_outbound_holds VALUES (?, ?)',
    [input.transferId, context.receiverDeviceId]);
  return 'created' as const;
}

export function createFramedSyncOutboundStaging(db: DbPort) {
  return {
    async publishOutbound(input: OutboundPublishInput) {
      return db.transaction((tx) => publishFramedSyncOutboundWithDbPort(tx, input));
    },

    async loadOutboundPublication(transferId: Uint8Array) {
      const value = await readFramedSyncRow(db,
        'SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?', [transferId]);
      return value ? readFramedSyncPublication(value) : null;
    },

    persistOutboundAttempt(transferId: Uint8Array, attempt: PreparedTransferAttempt) {
      return persistFramedSyncAttempt(db, transferId, 'transfer', attempt);
    },
    commitOutboundFrame(transferId: Uint8Array, attemptId: Uint8Array, value: StoredEncryptedFrame) {
      return commitFramedSyncFrame(db, transferId, 'transfer', attemptId, value);
    },
    finalizeOutboundAttempt(transferId: Uint8Array, attemptId: Uint8Array) {
      return finalizeFramedSyncAttempt(db, transferId, 'transfer', attemptId);
    },
    async abandonOutboundAttempt(transferId: Uint8Array, attemptId: Uint8Array) {
      await db.run(`UPDATE framed_sync_outbound_attempts SET state = 'abandoned'
        WHERE transfer_id = ? AND purpose = 'transfer' AND attempt_id = ?`, [transferId, attemptId]);
    },
    loadReplayableFrames(transferId: Uint8Array, attemptId: Uint8Array) {
      return loadReplayableFramedSyncFrames(db, transferId, 'transfer', attemptId);
    }
  };
}
