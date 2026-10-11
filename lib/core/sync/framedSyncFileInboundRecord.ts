import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { decodeFramedSyncFileJson, encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedFileDigest, framedFileHeader, framedFileProposal, framedFileReceipt } from './framedSyncFileSchemas.js';
import { assertInboundHeaderMatchesProposal, assertInboundProposalLimits, sameFramedSyncContext,
  type InboundHeaderDeclarationInput } from './framedSyncStagingContract.js';

const recordSchema = z.object({
  proposal: framedFileProposal, reservationId: z.string().min(1), header: framedFileHeader.optional(),
  verifiedManifest: framedFileDigest.optional(), receipt: framedFileReceipt.optional(),
  resourceDemandsCompleted: z.boolean().optional(),
  state: z.enum(['proposed', 'header_declared', 'receiving', 'ready_to_apply', 'applied']),
  completedAt: z.number().int().nonnegative().optional()
});
export type FramedSyncFileInboundRecord = Omit<z.infer<typeof recordSchema>, 'header'> & {
  header?: InboundHeaderDeclarationInput | undefined;
};

export function framedSyncInboundDirectory(transferId: Uint8Array) {
  if (transferId.byteLength !== 32) throw new Error('framed_sync_transfer_id_invalid');
  return `inbound/${bytesToHex(transferId)}`;
}

export async function readFramedSyncFileInbound(files: FramedSyncFilePort, transferId: Uint8Array) {
  const data = await files.read(`${framedSyncInboundDirectory(transferId)}/transfer.json`);
  if (!data) return null;
  const record = recordSchema.parse(decodeFramedSyncFileJson(data));
  const proposal = record.proposal;
  assertInboundProposalLimits(proposal);
  if (bytesToHex(proposal.transferId) !== bytesToHex(transferId) ||
      bytesToHex(await canonicalTransferId(proposal.context, proposal.contentId)) !== bytesToHex(transferId)) {
    throw new Error('inbound_transfer_identity_mismatch');
  }
  if (record.header) {
    assertInboundHeaderMatchesProposal(record.header);
    const headerProposal = record.header.proposal;
    if (!sameFramedSyncContext(headerProposal.context, proposal.context) ||
        bytesToHex(headerProposal.transferId) !== bytesToHex(proposal.transferId) ||
        bytesToHex(headerProposal.contentId) !== bytesToHex(proposal.contentId) ||
        headerProposal.factCount !== proposal.factCount || headerProposal.blobCount !== proposal.blobCount ||
        headerProposal.totalBlobBytes !== proposal.totalBlobBytes || record.header.reservationId !== record.reservationId) {
      throw new Error('inbound_reservation_mismatch');
    }
  }
  return record;
}

export function writeFramedSyncFileInbound(files: FramedSyncFilePort, record: FramedSyncFileInboundRecord) {
  return files.write(`${framedSyncInboundDirectory(record.proposal.transferId)}/transfer.json`, encodeFramedSyncFileJson(record));
}

export async function requireFramedSyncFileInbound(files: FramedSyncFilePort, transferId: Uint8Array,
  attemptId?: Uint8Array) {
  const record = await readFramedSyncFileInbound(files, transferId);
  if (!record || (attemptId && (!record.header ||
      bytesToHex(record.header.attemptId) !== bytesToHex(attemptId)))) throw new Error('inbound_attempt_unavailable');
  return record;
}

export function framedSyncInboundAttemptDirectory(transferId: Uint8Array, attemptId: Uint8Array) {
  if (attemptId.byteLength !== 16) throw new Error('framed_sync_attempt_id_invalid');
  return `${framedSyncInboundDirectory(transferId)}/${bytesToHex(attemptId)}`;
}
