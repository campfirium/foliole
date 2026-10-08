import type { ManifestBlobDescriptor } from './framedSyncBlobContract.js';
import {
  canonicalContentId,
  canonicalTransferId,
  type CanonicalManifest
} from './framedSyncCanonicalManifest.js';
import {
  assertAttemptId,
  FRAMED_SYNC_LIMITS,
  type FramedSyncContext,
  type PublishedTransfer
} from './framedSyncContract.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

export const FRAMED_SYNC_STAGING_KEYS = Object.freeze({
  attemptFrame: ['stream_kind', 'transfer_id', 'attempt_id', 'sequence'],
  availableBlob: ['sha256'],
  attemptBlobAssembly: ['transfer_id', 'attempt_id', 'sha256'],
  attemptFact: ['transfer_id', 'attempt_id', 'fact_kind', 'object_type', 'global_id', 'fact_id'],
  blobPin: ['transfer_id', 'sha256'],
  receipt: ['transfer_id'],
  transfer: ['transfer_id']
} as const);

export type OutboundPublishInput = Readonly<{
  inventoryDifference?: FramedSyncInventoryDifference;
  contentId: Uint8Array;
  context: FramedSyncContext;
  manifest: CanonicalManifest;
  manifestHash: Uint8Array;
  transferId: Uint8Array;
}>;

export type InboundProposalInput = Readonly<{
  blobCount: bigint;
  contentId: Uint8Array;
  context: FramedSyncContext;
  factCount: bigint;
  totalBlobBytes: bigint;
  transferId: Uint8Array;
}>;

export type InboundManifestInput = Readonly<{
  attemptId: Uint8Array;
  header: InboundHeaderDeclarationInput;
  proposal: InboundProposalInput;
  publication: OutboundPublishInput;
  reservationId: string;
}>;

export type InboundHeaderDeclarationInput = Readonly<{
  attemptId: Uint8Array;
  blobs: readonly ManifestBlobDescriptor[];
  facts: readonly InboundFactDescriptor[];
  proposal: InboundProposalInput;
  published: PublishedTransfer;
  reservationId: string;
}>;

export type InboundFinalizeInput = Readonly<{
  attemptId: Uint8Array;
  blobCount: bigint;
  factCount: bigint;
  manifestHash: Uint8Array;
  transferId: Uint8Array;
}>;

export type InboundFactDescriptor = Readonly<{
  factId: string;
  globalId: string;
  kind: number;
  objectType: string;
  requiredBlobHashes: readonly Uint8Array[];
  sharedStateHash: Uint8Array;
}>;

export type InboundFrameInput = Readonly<{
  attemptId: Uint8Array;
  authenticatedPlaintext: Uint8Array;
  ciphertext: Uint8Array;
  frameHeader: Uint8Array;
  frameType: number;
  preamble: Uint8Array;
  sequence: bigint;
  transferId: Uint8Array;
}>;

export type InboundFactInput = Readonly<{
  attemptId: Uint8Array;
  canonicalBytes: Uint8Array;
  factId: string;
  factKind: number;
  globalId: string;
  objectType: string;
  transferId: Uint8Array;
}>;

export type BlobOfferTransactionInput = Readonly<{
  blobs: readonly ManifestBlobDescriptor[];
  transferId: Uint8Array;
}>;

export type BlobChunkInput = Readonly<{
  attemptId: Uint8Array;
  data: Uint8Array;
  offset: bigint;
  sha256: Uint8Array;
  transferId: Uint8Array;
}>;

export type ApplyCommitInput = Readonly<{
  appliedStateHash: Uint8Array;
  contentId: Uint8Array;
  receiverDeviceId: string;
  receiverLibraryEpoch: string;
  transferId: Uint8Array;
}>;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

export function sameFramedSyncContext(left: FramedSyncContext, right: FramedSyncContext) {
  return left.protocolVersion === right.protocolVersion && left.groupId === right.groupId &&
    left.senderDeviceId === right.senderDeviceId &&
    left.senderLibraryEpoch === right.senderLibraryEpoch &&
    left.receiverDeviceId === right.receiverDeviceId &&
    left.receiverLibraryEpoch === right.receiverLibraryEpoch;
}

function hex(value: Uint8Array) {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function descriptorKey(value: InboundFactDescriptor) {
  return JSON.stringify([
    value.kind, value.objectType, value.globalId, value.factId, hex(value.sharedStateHash),
    value.requiredBlobHashes.map(hex).sort()
  ]);
}

function blobKey(value: ManifestBlobDescriptor) {
  return JSON.stringify([hex(value.sha256), value.byteLength.toString(), value.role, value.required]);
}

export function assertInboundProposalLimits(input: InboundProposalInput) {
  if (input.factCount < 0n || input.factCount > BigInt(FRAMED_SYNC_LIMITS.maxFactsPerTransfer) ||
      input.blobCount < 0n || input.blobCount > BigInt(FRAMED_SYNC_LIMITS.maxBlobsPerTransfer) ||
      input.totalBlobBytes < 0n || input.totalBlobBytes > BigInt(FRAMED_SYNC_LIMITS.maxTransferBytes)) {
    throw new Error('inbound_proposal_limit_exceeded');
  }
}

export async function assertOutboundPublication(input: OutboundPublishInput) {
  const contentId = await canonicalContentId(input.manifest);
  const transferId = await canonicalTransferId(input.context, contentId);
  if (!sameBytes(contentId, input.contentId) || !sameBytes(contentId, input.manifestHash)) {
    throw new Error('outbound_manifest_identity_mismatch');
  }
  if (!sameBytes(transferId, input.transferId)) throw new Error('outbound_transfer_identity_mismatch');
  return { contentId, transferId };
}

export async function assertInboundManifestMatchesProposal(input: InboundManifestInput) {
  assertAttemptId(input.attemptId);
  assertInboundHeaderMatchesProposal(input.header);
  assertInboundProposalLimits(input.proposal);
  await assertOutboundPublication(input.publication);
  const manifest = input.publication.manifest;
  const totalBlobBytes = manifest.blobs.reduce((total, blob) => total + blob.byteLength, 0n);
  if (input.proposal.factCount !== BigInt(manifest.facts.length) ||
      input.proposal.blobCount !== BigInt(manifest.blobs.length) ||
      input.proposal.totalBlobBytes !== totalBlobBytes ||
      !sameFramedSyncContext(input.proposal.context, input.publication.context) ||
      !sameBytes(input.proposal.contentId, input.publication.contentId) ||
      !sameBytes(input.proposal.transferId, input.publication.transferId)) {
    throw new Error('inbound_manifest_proposal_mismatch');
  }
  const facts = manifest.facts.map((fact) => descriptorKey({
    factId: fact.factId, globalId: fact.globalId, kind: fact.kind, objectType: fact.objectType,
    requiredBlobHashes: fact.blobs.filter((blob) => blob.required).map((blob) => blob.sha256),
    sharedStateHash: fact.sharedStateHash
  })).sort();
  const headerFacts = input.header.facts.map(descriptorKey).sort();
  const blobs = manifest.blobs.map(blobKey).sort();
  const headerBlobs = input.header.blobs.map(blobKey).sort();
  if (JSON.stringify(facts) !== JSON.stringify(headerFacts) ||
      JSON.stringify(blobs) !== JSON.stringify(headerBlobs)) {
    throw new Error('inbound_manifest_header_mismatch');
  }
}

export function assertInboundHeaderMatchesProposal(input: InboundHeaderDeclarationInput) {
  assertAttemptId(input.attemptId);
  assertInboundProposalLimits(input.proposal);
  const published = input.published;
  const totalBlobBytes = input.blobs.reduce((total, blob) => total + blob.byteLength, 0n);
  if (input.facts.length !== Number(published.factCount) ||
      input.blobs.length !== Number(published.blobCount) ||
      totalBlobBytes !== published.totalBlobBytes ||
      !sameFramedSyncContext(input.proposal.context, published.context) ||
      input.proposal.factCount !== published.factCount ||
      input.proposal.blobCount !== published.blobCount ||
      input.proposal.totalBlobBytes !== published.totalBlobBytes ||
      !sameBytes(input.proposal.contentId, published.contentId) ||
      !sameBytes(input.proposal.transferId, published.transferId)) {
    throw new Error('inbound_header_proposal_mismatch');
  }
}

export type { FramedSyncStagingPort } from './framedSyncStagingPort.js';

export const FRAMED_SYNC_STAGING_INVARIANTS = Object.freeze([
  'publish_outbound_writes_manifest_fact_refs_blob_refs_and_holds_in_one_transaction',
  'publish_rejects_structured_fact_or_blob_refs_that_do_not_match_canonical_manifest_bytes',
  'published_transfer_is_immutable',
  'attempt_is_persisted_before_encryption',
  'attempt_becomes_replayable_only_after_its_complete_ciphertext_set_is_durable',
  'receipt_attempt_is_persisted_before_encryption_and_replays_only_its_durable_ciphertext',
  'same_identity_with_different_bytes_is_rejected',
  'decoded_session_or_transfer_envelope_binding_precedes_any_staging_write',
  'authentication_failure_invalidates_the_whole_attempt',
  'proposal_limits_and_quota_reservation_commit_before_header_or_blob_bytes_are_accepted',
  'header_declaration_must_match_the_admitted_proposal_before_fact_or_blob_frames_are_accepted',
  'attempt_scoped_fact_and_chunk_rows_promote_only_after_trailer_and_full_canonical_manifest_verify',
  'full_canonical_manifest_must_match_header_descriptors_content_id_and_trailer_or_the_attempt_is_invalidated',
  'exact_blob_chunk_replay_is_idempotent_and_any_other_overlap_is_rejected',
  'blob_available_requires_pin_complete_coverage_length_and_sha256',
  'blob_offer_is_absent_from_missing_set_only_after_verified_durable_pin_commit',
  'offer_validation_pin_creation_assembly_creation_and_missing_set_commit_in_one_transaction',
  'partial_blob_assembly_is_transfer_scoped_and_verified_blob_content_is_hash_scoped',
  'apply_and_receipt_commit_in_one_business_transaction',
  'required_blob_pins_gate_fact_apply_while_missing_optional_blobs_do_not',
  'holds_release_only_after_matching_receipt_or_confirmed_termination',
  'timeouts_never_release_holds_or_pins'
] as const);
