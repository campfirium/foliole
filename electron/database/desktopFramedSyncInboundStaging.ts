import { createHash, randomUUID } from 'node:crypto';

import {
  encodeFramedSyncHeader,
  failFramedSync,
  framedSyncBytes,
  framedSyncText,
  readFramedSyncHeader,
  readFramedSyncProposal,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import {
  assertInboundHeaderMatchesProposal,
  assertInboundProposalLimits,
  sameFramedSyncContext,
  type InboundFactInput,
  type InboundFinalizeInput,
  type InboundFrameInput,
  type InboundHeaderDeclarationInput,
  type InboundProposalInput
} from '../../lib/core/sync/framedSyncStagingContract.js';

import { hashDesktopFramedSyncInboundManifest } from './desktopFramedSyncInboundManifestHash.js';

export async function clearInboundAttempt(tx: DbPort, transferId: Uint8Array, attemptId: Uint8Array) {
  await tx.run(`UPDATE framed_sync_inbound_attempts SET state = 'invalidated' WHERE transfer_id = ? AND attempt_id = ?`,
    [transferId, attemptId]);
  for (const table of ['framed_sync_inbound_facts', 'framed_sync_blob_chunks',
    'framed_sync_resource_blob_chunks',
    'framed_sync_inbound_frames', 'framed_sync_blob_offers']) {
    await tx.run(`DELETE FROM ${table} WHERE transfer_id = ? AND attempt_id = ?`, [transferId, attemptId]);
  }
  await tx.run('DELETE FROM framed_sync_blob_pins WHERE transfer_id = ?', [transferId]);
  await tx.run('DELETE FROM framed_sync_resource_pins WHERE transfer_id = ?', [transferId]);
  await tx.run(`UPDATE framed_sync_inbound_transfers SET header_json = NULL, manifest_hash = NULL,
    canonical_manifest = NULL, active_attempt_id = NULL, state = 'proposed'
    WHERE transfer_id = ? AND active_attempt_id = ?`, [transferId, attemptId]);
}

async function finalizeInbound(db: DbPort, input: InboundFinalizeInput) {
  const outcome = await db.transaction(async (tx) => {
    const value = await readFramedSyncRow(tx,
      'SELECT * FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [input.transferId]);
    if (!value?.header_json || !value.active_attempt_id ||
      !sameFramedSyncBytes(framedSyncBytes(value, 'active_attempt_id'), input.attemptId)) return 'invalid' as const;
    if (value.canonical_manifest) {
      if (sameFramedSyncBytes(framedSyncBytes(value, 'manifest_hash'), input.manifestHash)) return 'identical' as const;
      await clearInboundAttempt(tx, input.transferId, input.attemptId);
      return 'invalid' as const;
    }
    const declaration = readFramedSyncHeader(value);
    const { factCount, manifestHash: rebuiltHash } = await hashDesktopFramedSyncInboundManifest(
      tx, input.transferId, input.attemptId, declaration);
    const [offers] = await tx.query<{ count: number }>(`SELECT count(*) AS count FROM framed_sync_blob_offers
      WHERE transfer_id = ? AND attempt_id = ?`, [input.transferId, input.attemptId]);
    if (BigInt(factCount) !== input.factCount || BigInt(offers?.count ?? 0) !== input.blobCount ||
      input.factCount !== declaration.proposal.factCount || input.blobCount !== declaration.proposal.blobCount ||
      !sameFramedSyncBytes(rebuiltHash, input.manifestHash) ||
      !sameFramedSyncBytes(rebuiltHash, declaration.proposal.contentId)) {
      await clearInboundAttempt(tx, input.transferId, input.attemptId);
      return 'invalid' as const;
    }
    await tx.run(`UPDATE framed_sync_inbound_transfers SET canonical_manifest = ?, state = 'receiving'
      WHERE transfer_id = ?`, [rebuiltHash, input.transferId]);
    return 'created' as const;
  });
  if (outcome === 'invalid') failFramedSync('inbound_attempt_manifest_mismatch');
  return outcome;
}

function createInboundAdmissionStaging(db: DbPort) {
  return {
    async admitInboundProposal(input: InboundProposalInput) {
      assertInboundProposalLimits(input);
      return db.transaction(async (tx) => {
        const existing = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [input.transferId]);
        if (existing) {
          const old = readFramedSyncProposal(existing);
          if (!sameFramedSyncBytes(old.contentId, input.contentId) ||
            !sameFramedSyncContext(old.context, input.context) || old.factCount !== input.factCount ||
            old.blobCount !== input.blobCount || old.totalBlobBytes !== input.totalBlobBytes) {
            failFramedSync('inbound_proposal_conflict');
          }
          return { reservationId: framedSyncText(existing, 'reservation_id') };
        }
        const reservationId = randomUUID(); const context = input.context;
        await tx.run(`INSERT INTO framed_sync_inbound_transfers
          (transfer_id, content_id, protocol_version, group_id, sender_device_id, sender_library_epoch,
           receiver_device_id, receiver_library_epoch, fact_count, blob_count, total_blob_bytes, reservation_id, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed')`, [input.transferId, input.contentId,
          context.protocolVersion, context.groupId, context.senderDeviceId, context.senderLibraryEpoch,
          context.receiverDeviceId, context.receiverLibraryEpoch, input.factCount, input.blobCount,
          input.totalBlobBytes, reservationId]);
        return { reservationId };
      });
    },

    async loadInboundProposal(transferId: Uint8Array) {
      const value = await readFramedSyncRow(db,
        'SELECT * FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [transferId]);
      return value ? readFramedSyncProposal(value) : null;
    },

    async commitInboundHeaderDeclaration(input: InboundHeaderDeclarationInput) {
      assertInboundHeaderMatchesProposal(input);
      return db.transaction(async (tx) => {
        const value = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [input.proposal.transferId]);
        if (!value || framedSyncText(value, 'reservation_id') !== input.reservationId) {
          failFramedSync('inbound_reservation_mismatch');
        }
        if (value.header_json) return sameFramedSyncBytes(framedSyncBytes(value, 'active_attempt_id'), input.attemptId) &&
          encodeFramedSyncHeader(input) === framedSyncText(value, 'header_json')
          ? 'identical' as const : failFramedSync('inbound_header_conflict');
        await tx.run(`INSERT INTO framed_sync_inbound_attempts VALUES (?, ?, 'receiving')
          ON CONFLICT(transfer_id, attempt_id) DO UPDATE SET state = 'receiving'
          WHERE framed_sync_inbound_attempts.state = 'invalidated'`,
          [input.proposal.transferId, input.attemptId]);
        await tx.run(`UPDATE framed_sync_inbound_transfers SET header_json = ?, manifest_hash = ?,
          active_attempt_id = ?, state = 'header_declared' WHERE transfer_id = ?`,
        [encodeFramedSyncHeader(input), input.published.manifestHash, input.attemptId, input.proposal.transferId]);
        return 'created' as const;
      });
    },

    async loadInboundHeaderDeclaration(transferId: Uint8Array) {
      const value = await readFramedSyncRow(db, `SELECT * FROM framed_sync_inbound_transfers
        WHERE transfer_id = ? AND header_json IS NOT NULL`, [transferId]);
      return value ? readFramedSyncHeader(value) : null;
    }
  };
}

function createInboundAttemptStaging(db: DbPort) {
  return {
    finalizeInboundAttempt(input: InboundFinalizeInput) { return finalizeInbound(db, input); },

    async commitAuthenticatedFrame(input: InboundFrameInput) {
      return db.transaction(async (tx) => {
        const transfer = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [input.transferId]);
        const attempt = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_inbound_attempts
          WHERE transfer_id = ? AND attempt_id = ?`, [input.transferId, input.attemptId]);
        if (!transfer?.manifest_hash || !attempt || framedSyncText(attempt, 'state') !== 'receiving' ||
          !transfer.active_attempt_id ||
          !sameFramedSyncBytes(framedSyncBytes(transfer, 'active_attempt_id'), input.attemptId)) {
          failFramedSync('inbound_attempt_unavailable');
        }
        const existing = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_inbound_frames
          WHERE transfer_id = ? AND attempt_id = ? AND sequence = ?`,
        [input.transferId, input.attemptId, input.sequence.toString()]);
        const ciphertextDigest = new Uint8Array(createHash('sha256').update(input.ciphertext).digest());
        const compacted = input.frameType === 4 && (transfer.state === 'ready_to_apply' ||
          (existing?.authenticated_plaintext instanceof Uint8Array && existing.authenticated_plaintext.byteLength === 32));
        const plaintext = compacted
          ? new Uint8Array(createHash('sha256').update(input.authenticatedPlaintext).digest())
          : input.authenticatedPlaintext;
        if (existing) return sameFramedSyncBytes(framedSyncBytes(existing, 'ciphertext'), ciphertextDigest) &&
          sameFramedSyncBytes(framedSyncBytes(existing, 'authenticated_plaintext'), plaintext) &&
          sameFramedSyncBytes(framedSyncBytes(existing, 'frame_header'), input.frameHeader) &&
          sameFramedSyncBytes(framedSyncBytes(existing, 'preamble'), input.preamble) &&
          Number(existing.frame_type) === input.frameType
          ? 'identical' as const : failFramedSync('inbound_frame_identity_conflict');
        await tx.run('INSERT INTO framed_sync_inbound_frames VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [input.transferId,
          input.attemptId, input.sequence.toString(), input.frameType, input.preamble, input.frameHeader,
          ciphertextDigest, plaintext]);
        return 'created' as const;
      });
    },

    async invalidateInboundAttempt(transferId: Uint8Array, attemptId: Uint8Array) {
      await db.transaction((tx) => clearInboundAttempt(tx, transferId, attemptId));
    }
  };
}

function createInboundFactStaging(db: DbPort) {
  return {
    async stageInboundFact(input: InboundFactInput) {
      return db.transaction(async (tx) => {
        const transfer = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_inbound_transfers
          WHERE transfer_id = ? AND active_attempt_id = ? AND state = 'header_declared'`,
        [input.transferId, input.attemptId]);
        if (!transfer?.header_json) failFramedSync('inbound_header_required');
        const declared = readFramedSyncHeader(transfer).facts.some((fact) => fact.kind === input.factKind &&
          fact.objectType === input.objectType && fact.globalId === input.globalId && fact.factId === input.factId);
        if (!declared) failFramedSync('inbound_fact_undeclared');
        const existing = await readFramedSyncRow(tx, `SELECT canonical_bytes FROM framed_sync_inbound_facts
          WHERE transfer_id = ? AND attempt_id = ? AND fact_kind = ? AND object_type = ? AND global_id = ? AND fact_id = ?`,
        [input.transferId, input.attemptId, input.factKind, input.objectType, input.globalId, input.factId]);
        if (existing) return sameFramedSyncBytes(framedSyncBytes(existing, 'canonical_bytes'), input.canonicalBytes)
          ? 'identical' as const : failFramedSync('inbound_fact_identity_conflict');
        await tx.run('INSERT INTO framed_sync_inbound_facts VALUES (?, ?, ?, ?, ?, ?, ?)', [input.transferId,
          input.attemptId, input.factKind, input.objectType, input.globalId, input.factId, input.canonicalBytes]);
        return 'created' as const;
      });
    },

    async loadAttemptFacts(transferId: Uint8Array, attemptId: Uint8Array) {
      const rows = await db.query<DbRow>(`SELECT * FROM framed_sync_inbound_facts
        WHERE transfer_id = ? AND attempt_id = ? ORDER BY fact_kind, object_type, global_id, fact_id`,
      [transferId, attemptId]);
      return rows.map((row) => ({ attemptId, canonicalBytes: framedSyncBytes(row, 'canonical_bytes'),
        factId: framedSyncText(row, 'fact_id'), factKind: Number(row.fact_kind),
        globalId: framedSyncText(row, 'global_id'), objectType: framedSyncText(row, 'object_type'), transferId }));
    }
  };
}

export function createDesktopFramedSyncInboundStaging(db: DbPort) {
  return {
    ...createInboundAdmissionStaging(db),
    ...createInboundAttemptStaging(db),
    ...createInboundFactStaging(db)
  };
}
