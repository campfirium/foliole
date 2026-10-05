import type {
  PreparedTransferAttempt,
  StoredEncryptedFrame,
  TransferReceiptStage
} from './framedSyncContract.js';
import type { BlobChunkInput, InboundFactInput } from './framedSyncStagingContract.js';
export type TransferProtection = Readonly<{
  kind: 'hold' | 'pin';
  memberId: string;
  released: boolean;
  transferId: Uint8Array;
}>;

type InboundAttemptState = Readonly<{
  attempt: PreparedTransferAttempt;
  chunks: readonly BlobChunkInput[];
  facts: readonly InboundFactInput[];
  frames: readonly StoredEncryptedFrame[];
  memberId: string;
  nextSequence: bigint;
  status: 'invalid' | 'receiving';
  transferId: Uint8Array;
}>;

type ReceiptReplayState = Readonly<{
  attempt: PreparedTransferAttempt;
  frames: readonly StoredEncryptedFrame[];
  receipt: TransferReceiptStage;
  replayable: boolean;
}>;

type TerminationState = Readonly<{
  acknowledged: boolean;
  memberId: string;
  transferId: Uint8Array;
}>;
export type FramedSyncRecoveryState = Readonly<{
  attempts: readonly InboundAttemptState[];
  protections: readonly TransferProtection[];
  receiptReplays: readonly ReceiptReplayState[];
  terminations: readonly TerminationState[];
}>;

export type FramedSyncRecoveryEvent =
  | Readonly<{ attempt: PreparedTransferAttempt; memberId: string; startingSequence: bigint;
    transferId: Uint8Array; type: 'attempt_started' }>
  | Readonly<{ frame: StoredEncryptedFrame; attemptId: Uint8Array;
    transferId: Uint8Array; type: 'frame_authenticated' }>
  | Readonly<{ fact: InboundFactInput; type: 'fact_staged' }>
  | Readonly<{ chunk: BlobChunkInput; type: 'blob_chunk_staged' }>
  | Readonly<{ attemptId: Uint8Array; transferId: Uint8Array; type: 'authentication_failed' }>
  | Readonly<{ attempt: PreparedTransferAttempt; receipt: TransferReceiptStage;
    type: 'receipt_attempt_persisted' }>
  | Readonly<{ attemptId: Uint8Array; frame: StoredEncryptedFrame;
    transferId: Uint8Array; type: 'receipt_frame_persisted' }>
  | Readonly<{ attemptId: Uint8Array; transferId: Uint8Array;
    type: 'receipt_attempt_finalized' }>
  | Readonly<{ memberId: string; transferId: Uint8Array; type: 'termination_request_persisted' }>
  | Readonly<{ memberId: string; transferId: Uint8Array; type: 'termination_acknowledged' }>
  | Readonly<{ memberId: string; transferId: Uint8Array; type: 'timeout_elapsed' }>;

function same(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function sameFrame(left: StoredEncryptedFrame, right: StoredEncryptedFrame) {
  return left.sequence === right.sequence && left.frameType === right.frameType &&
    same(left.frameHeader, right.frameHeader) && same(left.ciphertext, right.ciphertext);
}

function sameTransferMember(
  value: Readonly<{ memberId: string; transferId: Uint8Array }>,
  transferId: Uint8Array,
  memberId: string
) {
  return value.memberId === memberId && same(value.transferId, transferId);
}

function attemptIndex(state: FramedSyncRecoveryState, transferId: Uint8Array, attemptId: Uint8Array) {
  return state.attempts.findIndex((value) =>
    same(value.transferId, transferId) && same(value.attempt.attemptId, attemptId));
}

function updateAttempt(
  state: FramedSyncRecoveryState,
  index: number,
  update: (value: InboundAttemptState) => InboundAttemptState
) {
  if (index < 0) throw new Error('inbound_attempt_unknown');
  const attempts = [...state.attempts];
  attempts[index] = update(attempts[index]!);
  return { ...state, attempts };
}

function startAttempt(state: FramedSyncRecoveryState, event: Extract<FramedSyncRecoveryEvent,
  { type: 'attempt_started' }>) {
  if (event.startingSequence !== 0n) throw new Error('new_attempt_sequence_must_start_at_zero');
  const history = state.attempts.filter((value) =>
    sameTransferMember(value, event.transferId, event.memberId));
  if (history.some((value) => value.status === 'receiving')) throw new Error('inbound_attempt_active');
  if (history.some((value) => same(value.attempt.attemptId, event.attempt.attemptId))) {
    throw new Error('attempt_id_reuse');
  }
  if (history.some((value) => same(value.attempt.noncePrefix, event.attempt.noncePrefix))) {
    throw new Error('attempt_nonce_reuse');
  }
  const created: InboundAttemptState = { attempt: event.attempt, chunks: [], facts: [], frames: [],
    memberId: event.memberId, nextSequence: 0n, status: 'receiving', transferId: event.transferId };
  return { ...state, attempts: [...state.attempts, created] };
}

function acceptFrame(state: FramedSyncRecoveryState, event: Extract<FramedSyncRecoveryEvent,
  { type: 'frame_authenticated' }>) {
  const index = attemptIndex(state, event.transferId, event.attemptId);
  return updateAttempt(state, index, (value) => {
    if (value.status !== 'receiving') throw new Error('late_attempt_frame_rejected');
    if (event.frame.sequence < value.nextSequence) {
      const existing = value.frames.find((frame) => frame.sequence === event.frame.sequence);
      if (existing && sameFrame(existing, event.frame)) return value;
    }
    if (event.frame.sequence !== value.nextSequence) throw new Error('frame_sequence_not_contiguous');
    return { ...value, frames: [...value.frames, event.frame], nextSequence: value.nextSequence + 1n };
  });
}

function receiptIndex(state: FramedSyncRecoveryState, transferId: Uint8Array, attemptId: Uint8Array) {
  return state.receiptReplays.findIndex((value) => same(value.receipt.transferId, transferId) &&
    same(value.attempt.attemptId, attemptId));
}

function updateReceiptReplay(
  state: FramedSyncRecoveryState,
  event: Extract<FramedSyncRecoveryEvent,
    { type: 'receipt_frame_persisted' | 'receipt_attempt_finalized' }>
) {
  const index = receiptIndex(state, event.transferId, event.attemptId);
  if (index < 0) throw new Error('receipt_attempt_not_persisted');
  const receiptReplays = [...state.receiptReplays];
  const replay = receiptReplays[index]!;
  if (event.type === 'receipt_attempt_finalized') {
    if (replay.frames.length === 0) throw new Error('receipt_frame_required');
    if (replay.replayable) return state;
    receiptReplays[index] = { ...replay, replayable: true };
  } else {
    if (replay.replayable) throw new Error('receipt_attempt_already_finalized');
    if (event.frame.sequence < BigInt(replay.frames.length)) {
      const existing = replay.frames.find((frame) => frame.sequence === event.frame.sequence);
      if (existing && sameFrame(existing, event.frame)) return state;
    }
    if (event.frame.sequence !== BigInt(replay.frames.length)) throw new Error('frame_sequence_not_contiguous');
    receiptReplays[index] = { ...replay, frames: [...replay.frames, event.frame] };
  }
  return { ...state, receiptReplays };
}

export function createFramedSyncRecoveryState(
  protections: readonly TransferProtection[] = []
): FramedSyncRecoveryState {
  return { attempts: [], protections, receiptReplays: [], terminations: [] };
}

export function transitionFramedSyncRecovery(
  state: FramedSyncRecoveryState,
  event: FramedSyncRecoveryEvent
): FramedSyncRecoveryState {
  if (event.type === 'attempt_started') return startAttempt(state, event);
  if (event.type === 'frame_authenticated') return acceptFrame(state, event);
  if (event.type === 'fact_staged' || event.type === 'blob_chunk_staged') {
    const value = event.type === 'fact_staged' ? event.fact : event.chunk;
    const index = attemptIndex(state, value.transferId, value.attemptId);
    return updateAttempt(state, index, (attempt) => {
      if (attempt.status !== 'receiving') throw new Error('late_attempt_data_rejected');
      return event.type === 'fact_staged'
        ? { ...attempt, facts: [...attempt.facts, event.fact] }
        : { ...attempt, chunks: [...attempt.chunks, event.chunk] };
    });
  }
  if (event.type === 'authentication_failed') {
    const index = attemptIndex(state, event.transferId, event.attemptId);
    return updateAttempt(state, index, (value) => ({ ...value, chunks: [], facts: [], frames: [],
      status: 'invalid' }));
  }
  if (event.type === 'receipt_attempt_persisted') {
    if (state.receiptReplays.some((value) => same(value.receipt.transferId, event.receipt.transferId) &&
      (same(value.attempt.attemptId, event.attempt.attemptId) ||
       same(value.attempt.noncePrefix, event.attempt.noncePrefix)))) throw new Error('receipt_attempt_reuse');
    return { ...state, receiptReplays: [...state.receiptReplays,
      { attempt: event.attempt, frames: [], receipt: event.receipt, replayable: false }] };
  }
  if (event.type === 'receipt_frame_persisted' || event.type === 'receipt_attempt_finalized') {
    return updateReceiptReplay(state, event);
  }
  if (event.type === 'termination_request_persisted') {
    if (state.terminations.some((value) => sameTransferMember(value, event.transferId, event.memberId))) return state;
    return { ...state, terminations: [...state.terminations, { acknowledged: false,
      memberId: event.memberId, transferId: event.transferId }] };
  }
  if (event.type === 'termination_acknowledged') {
    const index = state.terminations.findIndex((value) =>
      sameTransferMember(value, event.transferId, event.memberId));
    if (index < 0) throw new Error('termination_request_not_durable');
    const terminations = [...state.terminations];
    terminations[index] = { ...terminations[index]!, acknowledged: true };
    const protections = state.protections.map((value) => sameTransferMember(
      value, event.transferId, event.memberId) ? { ...value, released: true } : value);
    return { ...state, protections, terminations };
  }
  return state;
}

export function replayableReceiptFrames(
  state: FramedSyncRecoveryState,
  transferId: Uint8Array,
  attemptId: Uint8Array
) {
  const value = state.receiptReplays[receiptIndex(state, transferId, attemptId)];
  if (!value?.replayable) throw new Error('receipt_attempt_not_replayable');
  return value.frames;
}
