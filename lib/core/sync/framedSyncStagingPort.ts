import type {
  PreparedTransferAttempt,
  StoredEncryptedFrame,
  TransferReceiptStage
} from './framedSyncContract.js';
import type {
  ApplyCommitInput,
  BlobChunkInput,
  BlobOfferTransactionInput,
  InboundFactInput,
  InboundFinalizeInput,
  InboundFrameInput,
  InboundHeaderDeclarationInput,
  InboundProposalInput,
  OutboundPublishInput
} from './framedSyncStagingContract.js';

export interface FramedSyncStagingPort {
  publishOutbound(input: OutboundPublishInput): Promise<'created' | 'identical'>;
  loadOutboundPublication(transferId: Uint8Array): Promise<OutboundPublishInput | null>;
  persistOutboundAttempt(
    transferId: Uint8Array,
    attempt: PreparedTransferAttempt
  ): Promise<'created' | 'identical'>;
  commitOutboundFrame(
    transferId: Uint8Array,
    attemptId: Uint8Array,
    frame: StoredEncryptedFrame
  ): Promise<'created' | 'identical'>;
  finalizeOutboundAttempt(
    transferId: Uint8Array,
    attemptId: Uint8Array
  ): Promise<'replayable' | 'identical'>;
  abandonOutboundAttempt(transferId: Uint8Array, attemptId: Uint8Array): Promise<void>;
  loadReplayableFrames(
    transferId: Uint8Array,
    attemptId: Uint8Array
  ): Promise<readonly StoredEncryptedFrame[]>;
  commitOutboundReceipt(receipt: TransferReceiptStage): Promise<'committed' | 'identical'>;
  releaseOutboundHolds(transferId: Uint8Array): Promise<void>;

  admitInboundProposal(input: InboundProposalInput): Promise<Readonly<{ reservationId: string }>>;
  loadInboundProposal(transferId: Uint8Array): Promise<InboundProposalInput | null>;
  commitInboundHeaderDeclaration(input: InboundHeaderDeclarationInput): Promise<'created' | 'identical'>;
  loadInboundHeaderDeclaration(
    transferId: Uint8Array
  ): Promise<InboundHeaderDeclarationInput | null>;
  /** Rebuilds and verifies the manifest from this attempt's durable header, facts and blobs. */
  finalizeInboundAttempt(input: InboundFinalizeInput): Promise<'created' | 'identical'>;
  commitAuthenticatedFrame(input: InboundFrameInput): Promise<'created' | 'identical'>;
  invalidateInboundAttempt(transferId: Uint8Array, attemptId: Uint8Array): Promise<void>;
  stageInboundFact(input: InboundFactInput): Promise<'created' | 'identical'>;
  loadAttemptFacts(transferId: Uint8Array, attemptId: Uint8Array): Promise<readonly InboundFactInput[]>;
  commitBlobOfferAndMissingSet(input: BlobOfferTransactionInput): Promise<readonly Uint8Array[]>;
  writeBlobChunk(input: BlobChunkInput): Promise<'created' | 'identical'>;
  verifyAndMarkBlobAvailable(
    transferId: Uint8Array,
    attemptId: Uint8Array,
    sha256: Uint8Array
  ): Promise<'available' | 'identical'>;
  markReadyToApply(transferId: Uint8Array): Promise<void>;
  commitApplyAndReceipt(input: ApplyCommitInput): Promise<TransferReceiptStage>;
  loadReceipt(transferId: Uint8Array): Promise<TransferReceiptStage | null>;
  persistReceiptAttempt(
    receipt: TransferReceiptStage,
    attempt: PreparedTransferAttempt
  ): Promise<'created' | 'identical'>;
  commitReceiptFrame(
    transferId: Uint8Array,
    attemptId: Uint8Array,
    frame: StoredEncryptedFrame
  ): Promise<'created' | 'identical'>;
  finalizeReceiptAttempt(transferId: Uint8Array, attemptId: Uint8Array): Promise<void>;
  loadReplayableReceiptFrames(
    transferId: Uint8Array,
    attemptId: Uint8Array
  ): Promise<readonly StoredEncryptedFrame[]>;

  acknowledgeTermination(transferId: Uint8Array, memberId: string): Promise<void>;
  releasePins(
    transferId: Uint8Array,
    reason: 'business_reference_committed' | 'termination_acknowledged'
  ): Promise<void>;
}
