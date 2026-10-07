import { framedSyncBytes, readFramedSyncContext, readFramedSyncHeader, readFramedSyncRow,
  sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_FRAME_TYPES, type PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { assertInboundHeaderMatchesProposal, assertInboundManifestMatchesProposal } from '../../lib/core/sync/framedSyncStagingContract.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';

type ReadyPublication = Pick<PublishedTransfer, 'context' | 'contentId' | 'manifestHash' | 'transferId'>;
type ReadyFactFrame = DbRow & { sequence: string };

/** Recover authenticated metadata only; durable body pins remain owned by the ready transfer. */
export async function loadDesktopFramedSyncReadyFacts(db: DbPort, published: ReadyPublication) {
  const row = await readFramedSyncRow(db, `SELECT * FROM framed_sync_inbound_transfers
    WHERE transfer_id = ? AND state = 'ready_to_apply'`, [published.transferId]);
  if (!row) return null;
  const context = readFramedSyncContext(row);
  if (row.protocol_version !== published.context.protocolVersion ||
      Object.entries(context).some(([key, value]) => published.context[key as keyof typeof context] !== value)) {
    throw new Error('framed_sync_transfer_context_mismatch');
  }
  const header = readFramedSyncHeader(row);
  assertInboundHeaderMatchesProposal(header);
  if (!sameFramedSyncBytes(header.published.manifestHash, published.manifestHash) ||
      !sameFramedSyncBytes(header.published.contentId, published.contentId)) throw new Error('framed_sync_ready_manifest_mismatch');
  if (!sameFramedSyncBytes(await canonicalTransferId(context, published.contentId), published.transferId)) {
    throw new Error('inbound_transfer_identity_mismatch');
  }
  const facts = await readReadyFactFrames(db, published.transferId, framedSyncBytes(row, 'active_attempt_id'));
  const manifest = { facts, blobs: header.blobs };
  await assertInboundManifestMatchesProposal({ attemptId: header.attemptId, header, proposal: header.proposal,
    publication: { ...header.published, manifest }, reservationId: header.reservationId });
  const first = facts[0];
  if (!first || facts.some((fact) => fact.globalId !== first.globalId || fact.objectType !== first.objectType ||
    ![1, 2, 3, 4].includes(fact.kind))) throw new Error('framed_sync_process_fact_set_invalid');
  return { facts, blobs: header.blobs, context, contentId: published.contentId,
    manifestHash: published.manifestHash, transferId: published.transferId,
    globalId: first.globalId, objectType: first.objectType };
}

async function readReadyFactFrames(db: DbPort, transferId: Uint8Array, attemptId: Uint8Array) {
  const facts: ReturnType<typeof canonicalFactFromValidatedMessage>[] = [];
  let after: string | null = null;
  for (;;) {
    const frames: ReadyFactFrame[] = await db.query<ReadyFactFrame>(`SELECT sequence, authenticated_plaintext
      FROM framed_sync_inbound_frames WHERE transfer_id = ? AND attempt_id = ? AND frame_type = ?
        AND (? IS NULL OR length(sequence) > ? OR
          (length(sequence) = ? AND sequence COLLATE BINARY > ?))
      ORDER BY length(sequence), sequence COLLATE BINARY LIMIT 1`,
    [transferId, attemptId, FRAMED_SYNC_FRAME_TYPES.fact, after, after?.length ?? null,
      after?.length ?? null, after]);
    const frame: ReadyFactFrame | undefined = frames[0];
    if (!frame) return facts;
    facts.push(canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(
      framedSyncBytes(frame, 'authenticated_plaintext'), FRAMED_SYNC_FRAME_TYPES.fact)));
    after = frame.sequence;
  }
}
