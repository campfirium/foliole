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
  type InboundFactInput,
  type InboundFinalizeInput,
  type InboundFrameInput,
  type InboundHeaderDeclarationInput,
  type InboundProposalInput
} from '../../lib/core/sync/framedSyncStagingContract.js';

const MANIFEST_DOMAIN = new TextEncoder().encode('foliole-framed-sync-content-v1');
function u32(value: number) { const result = Buffer.alloc(4); result.writeUInt32BE(value); return result; }
function u64(value: bigint) { const result = Buffer.alloc(8); result.writeBigUInt64BE(value); return result; }
function data(value: Uint8Array) { return Buffer.concat([u32(value.byteLength), value]); }
function compareBytes(left: Uint8Array, right: Uint8Array) { return Buffer.compare(left, right); }
function compareText(left: unknown, right: unknown) {
  return compareBytes(new TextEncoder().encode(String(left)), new TextEncoder().encode(String(right)));
}
function compareFactRows(left: DbRow, right: DbRow) {
  return Number(left.fact_kind) - Number(right.fact_kind) || compareText(left.object_type, right.object_type) ||
    compareText(left.global_id, right.global_id) || compareText(left.fact_id, right.fact_id);
}
function manifestBytes(facts: readonly DbRow[], declaration: InboundHeaderDeclarationInput) {
  const chunks: Uint8Array[] = [data(MANIFEST_DOMAIN), u32(facts.length)];
  for (const fact of [...facts].sort(compareFactRows)) chunks.push(framedSyncBytes(fact, 'canonical_bytes'));
  const blobs = [...declaration.blobs].sort((left, right) => compareBytes(left.sha256, right.sha256));
  chunks.push(u32(blobs.length));
  for (const item of blobs) chunks.push(data(item.sha256), u64(item.byteLength), u32(item.role),
    Uint8Array.of(item.required ? 1 : 0));
  return new Uint8Array(Buffer.concat(chunks));
}

export async function clearInboundAttempt(tx: DbPort, transferId: Uint8Array, attemptId: Uint8Array) {
  await tx.run(`UPDATE framed_sync_inbound_attempts SET state = 'invalidated' WHERE transfer_id = ? AND attempt_id = ?`,
    [transferId, attemptId]);
  for (const table of ['framed_sync_inbound_facts', 'framed_sync_blob_chunks',
    'framed_sync_inbound_frames', 'framed_sync_blob_offers']) {
    await tx.run(`DELETE FROM ${table} WHERE transfer_id = ? AND attempt_id = ?`, [transferId, attemptId]);
  }
  await tx.run('DELETE FROM framed_sync_blob_pins WHERE transfer_id = ?', [transferId]);
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
    const facts = await tx.query<DbRow>(`SELECT * FROM framed_sync_inbound_facts
      WHERE transfer_id = ? AND attempt_id = ?`, [input.transferId, input.attemptId]);
    const offers = await tx.query<DbRow>(`SELECT * FROM framed_sync_blob_offers
      WHERE transfer_id = ? AND attempt_id = ?`, [input.transferId, input.attemptId]);
    const rebuilt = manifestBytes(facts, declaration);
    const rebuiltHash = new Uint8Array(createHash('sha256').update(rebuilt).digest());
    if (BigInt(facts.length) !== input.factCount || BigInt(offers.length) !== input.blobCount ||
      input.factCount !== declaration.proposal.factCount || input.blobCount !== declaration.proposal.blobCount ||
      !sameFramedSyncBytes(rebuiltHash, input.manifestHash) ||
      !sameFramedSyncBytes(rebuiltHash, declaration.proposal.contentId)) {
      await clearInboundAttempt(tx, input.transferId, input.attemptId);
      return 'invalid' as const;
    }
    await tx.run(`UPDATE framed_sync_inbound_transfers SET canonical_manifest = ?, state = 'receiving'
      WHERE transfer_id = ?`, [rebuilt, input.transferId]);
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
            JSON.stringify(old.context) !== JSON.stringify(input.context) || old.factCount !== input.factCount ||
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
        await tx.run(`INSERT INTO framed_sync_inbound_attempts VALUES (?, ?, 'receiving')`,
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
        if (existing) return sameFramedSyncBytes(framedSyncBytes(existing, 'ciphertext'), input.ciphertext) &&
          sameFramedSyncBytes(framedSyncBytes(existing, 'authenticated_plaintext'), input.authenticatedPlaintext) &&
          sameFramedSyncBytes(framedSyncBytes(existing, 'frame_header'), input.frameHeader) &&
          sameFramedSyncBytes(framedSyncBytes(existing, 'preamble'), input.preamble) &&
          Number(existing.frame_type) === input.frameType
          ? 'identical' as const : failFramedSync('inbound_frame_identity_conflict');
        await tx.run('INSERT INTO framed_sync_inbound_frames VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [input.transferId,
          input.attemptId, input.sequence.toString(), input.frameType, input.preamble, input.frameHeader,
          input.ciphertext, input.authenticatedPlaintext]);
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
