import {
  encodeFramedSyncManifest,
  failFramedSync,
  framedSyncBytes,
  readFramedSyncPublication,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { PreparedTransferAttempt, StoredEncryptedFrame } from '../../lib/core/sync/framedSyncContract.js';
import { assertOutboundPublication, type OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';

import {
  commitFramedSyncFrame,
  finalizeFramedSyncAttempt,
  loadReplayableFramedSyncFrames,
  persistFramedSyncAttempt
} from './desktopFramedSyncAttemptStaging.js';

export function createDesktopFramedSyncOutboundStaging(db: DbPort) {
  return {
    async publishOutbound(input: OutboundPublishInput) {
      const verified = await assertOutboundPublication(input);
      return db.transaction(async (tx) => {
        const prior = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?', [input.transferId]);
        if (prior) return sameFramedSyncBytes(framedSyncBytes(prior, 'content_id'), input.contentId) &&
          sameFramedSyncBytes(framedSyncBytes(prior, 'canonical_manifest'), verified.canonicalBytes)
          ? 'identical' as const : failFramedSync('outbound_publication_conflict');
        const context = input.context;
        await tx.run(`INSERT INTO framed_sync_outbound_publications VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`, [input.transferId, input.contentId,
          input.manifestHash, verified.canonicalBytes, encodeFramedSyncManifest(input.manifest),
          context.protocolVersion, context.groupId, context.senderDeviceId, context.senderLibraryEpoch,
          context.receiverDeviceId, context.receiverLibraryEpoch, input.manifest.facts.length,
          input.manifest.blobs.length, input.manifest.blobs.reduce((sum, blob) => sum + blob.byteLength, 0n)]);
        for (const fact of input.manifest.facts) await tx.run(
          'INSERT INTO framed_sync_outbound_fact_refs VALUES (?, ?, ?, ?, ?)',
          [input.transferId, fact.kind, fact.objectType, fact.globalId, fact.factId]);
        for (const blob of input.manifest.blobs) await tx.run(
          'INSERT INTO framed_sync_outbound_blob_refs VALUES (?, ?, ?, ?, ?)',
          [input.transferId, blob.sha256, blob.byteLength, blob.role, blob.required ? 1 : 0]);
        await tx.run('INSERT INTO framed_sync_outbound_holds VALUES (?, ?)',
          [input.transferId, context.receiverDeviceId]);
        return 'created' as const;
      });
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
