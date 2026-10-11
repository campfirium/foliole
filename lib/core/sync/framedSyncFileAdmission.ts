import { bytesToHex } from '@noble/hashes/utils.js';

import { encodeFramedSyncHeader } from '../database/framedSyncStagingSerialization.js';

import { canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { framedSyncInboundAttemptDirectory, framedSyncInboundDirectory, readFramedSyncFileInbound,
  requireFramedSyncFileInbound, writeFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { assertInboundHeaderMatchesProposal, assertInboundProposalLimits, sameFramedSyncContext,
  type InboundHeaderDeclarationInput, type InboundProposalInput } from './framedSyncStagingContract.js';

function sameProposal(left: InboundProposalInput, right: InboundProposalInput) {
  return bytesToHex(left.transferId) === bytesToHex(right.transferId) &&
    bytesToHex(left.contentId) === bytesToHex(right.contentId) && sameFramedSyncContext(left.context, right.context) &&
    left.factCount === right.factCount && left.blobCount === right.blobCount && left.totalBlobBytes === right.totalBlobBytes;
}

async function admit(files: FramedSyncFilePort, input: InboundProposalInput) {
  assertInboundProposalLimits(input);
  if (bytesToHex(await canonicalTransferId(input.context, input.contentId)) !== bytesToHex(input.transferId)) {
    throw new Error('inbound_transfer_identity_mismatch');
  }
  return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
    const existing = await readFramedSyncFileInbound(files, input.transferId);
    if (existing) {
      if (!sameProposal(existing.proposal, input)) throw new Error('inbound_proposal_conflict');
      return { reservationId: existing.reservationId };
    }
    const reservationId = globalThis.crypto.randomUUID();
    await writeFramedSyncFileInbound(files, { proposal: input, reservationId, state: 'proposed' });
    return { reservationId };
  });
}

async function declareHeader(files: FramedSyncFilePort, input: InboundHeaderDeclarationInput) {
  assertInboundHeaderMatchesProposal(input);
  return files.exclusive(framedSyncInboundDirectory(input.proposal.transferId), async () => {
    const record = await requireFramedSyncFileInbound(files, input.proposal.transferId);
    if (record.reservationId !== input.reservationId || !sameProposal(record.proposal, input.proposal)) {
      throw new Error('inbound_reservation_mismatch');
    }
    if (record.header) {
      if (bytesToHex(record.header.attemptId) !== bytesToHex(input.attemptId) ||
          encodeFramedSyncHeader(record.header) !== encodeFramedSyncHeader(input)) throw new Error('inbound_header_conflict');
      return 'identical' as const;
    }
    await writeFramedSyncFileInbound(files, { ...record, header: input, state: 'header_declared' });
    return 'created' as const;
  });
}

export function createFramedSyncFileAdmission(files: FramedSyncFilePort) {
  return {
    admitInboundProposal: (input: InboundProposalInput) => admit(files, input),
    async loadInboundProposal(id: Uint8Array) { return (await readFramedSyncFileInbound(files, id))?.proposal ?? null; },
    commitInboundHeaderDeclaration: (input: InboundHeaderDeclarationInput) => declareHeader(files, input),
    async loadInboundHeaderDeclaration(id: Uint8Array) { return (await readFramedSyncFileInbound(files, id))?.header ?? null; },
    async invalidateInboundAttempt(transferId: Uint8Array, attemptId: Uint8Array) {
      await files.exclusive(framedSyncInboundDirectory(transferId), async () => {
        const record = await readFramedSyncFileInbound(files, transferId);
        if (!record || record.state === 'applied' || record.state === 'ready_to_apply') return;
        if (record.header && bytesToHex(record.header.attemptId) === bytesToHex(attemptId)) {
          await writeFramedSyncFileInbound(files, { proposal: record.proposal, reservationId: record.reservationId, state: 'proposed' });
        }
        await files.remove(framedSyncInboundAttemptDirectory(transferId, attemptId));
      });
    }
  };
}
