import { describe, expect, it } from 'vitest';

import type {
  PreparedTransferAttempt,
  StoredEncryptedFrame,
  TransferReceiptStage
} from './framedSyncContract.js';
import {
  createFramedSyncRecoveryState,
  replayableReceiptFrames,
  transitionFramedSyncRecovery,
  type FramedSyncRecoveryState,
  type TransferProtection
} from './framedSyncRecoveryStateMachine.js';

const bytes = (value: number, length: number) => new Uint8Array(length).fill(value);
const transfer = (value: number) => bytes(value, 32);
const attempt = (value: number): PreparedTransferAttempt => ({
  attemptId: bytes(value, 16), noncePrefix: bytes(value, 4), preamble: bytes(value, 96),
  state: 'prepared'
});
const frame = (sequence: bigint, value: number): StoredEncryptedFrame => ({
  ciphertext: bytes(value, 17), frameHeader: bytes(value, 16), frameType: 3, sequence
});

function begin(state: FramedSyncRecoveryState, transferId: Uint8Array, value: number) {
  return transitionFramedSyncRecovery(state, { attempt: attempt(value), memberId: 'member-b',
    startingSequence: 0n, transferId, type: 'attempt_started' });
}

describe('framed sync attempt recovery state', () => {
  it('clears all attempt A provisional state and rejects its late frames', () => {
    const transferId = transfer(1);
    const attemptA = attempt(2);
    let state = begin(createFramedSyncRecoveryState(), transferId, 2);
    state = transitionFramedSyncRecovery(state, { attemptId: attemptA.attemptId,
      frame: frame(0n, 3), transferId, type: 'frame_authenticated' });
    state = transitionFramedSyncRecovery(state, { fact: { attemptId: attemptA.attemptId,
      canonicalBytes: bytes(4, 8), factId: 'fact-a', factKind: 1, globalId: 'node-a',
      objectType: 'node', transferId }, type: 'fact_staged' });
    state = transitionFramedSyncRecovery(state, { chunk: { attemptId: attemptA.attemptId,
      data: bytes(5, 8), offset: 0n, sha256: bytes(6, 32), transferId },
    type: 'blob_chunk_staged' });

    state = transitionFramedSyncRecovery(state, { attemptId: attemptA.attemptId,
      transferId, type: 'authentication_failed' });
    expect(state.attempts[0]).toMatchObject({ chunks: [], facts: [], frames: [], status: 'invalid' });
    expect(() => transitionFramedSyncRecovery(state, { attemptId: attemptA.attemptId,
      frame: frame(1n, 7), transferId, type: 'frame_authenticated' }))
      .toThrow('late_attempt_frame_rejected');
  });

  it('starts attempt B with a new nonce and a fresh sequence', () => {
    const transferId = transfer(8);
    const attemptA = attempt(9);
    let state = begin(createFramedSyncRecoveryState(), transferId, 9);
    state = transitionFramedSyncRecovery(state, { attemptId: attemptA.attemptId,
      frame: frame(0n, 1), transferId, type: 'frame_authenticated' });
    state = transitionFramedSyncRecovery(state, { attemptId: attemptA.attemptId,
      transferId, type: 'authentication_failed' });
    expect(() => transitionFramedSyncRecovery(state, { attempt: { ...attempt(10),
      noncePrefix: attemptA.noncePrefix }, memberId: 'member-b', startingSequence: 0n,
    transferId, type: 'attempt_started' })).toThrow('attempt_nonce_reuse');
    expect(() => transitionFramedSyncRecovery(state, { attempt: attempt(10),
      memberId: 'member-b', startingSequence: 1n, transferId,
    type: 'attempt_started' })).toThrow('new_attempt_sequence_must_start_at_zero');

    state = begin(state, transferId, 10);
    state = transitionFramedSyncRecovery(state, { attemptId: attempt(10).attemptId,
      frame: frame(0n, 11), transferId, type: 'frame_authenticated' });
    expect(state.attempts[1]).toMatchObject({ nextSequence: 1n, status: 'receiving' });
  });
});

it('replays only a fully durable receipt ciphertext set', () => {
  const transferId = transfer(12);
  const receiptAttempt = attempt(13);
  const receipt: TransferReceiptStage = { appliedStateHash: bytes(14, 32), contentId: bytes(15, 32),
    receiverDeviceId: 'member-b', receiverLibraryEpoch: 'epoch-b', transferId };
  let state = transitionFramedSyncRecovery(createFramedSyncRecoveryState(), {
    attempt: receiptAttempt, receipt, type: 'receipt_attempt_persisted'
  });
  state = transitionFramedSyncRecovery(state, { attemptId: receiptAttempt.attemptId,
    frame: frame(0n, 16), transferId, type: 'receipt_frame_persisted' });
  state = transitionFramedSyncRecovery(state, { attemptId: receiptAttempt.attemptId,
    frame: frame(0n, 16), transferId, type: 'receipt_frame_persisted' });
  expect(() => replayableReceiptFrames(state, transferId, receiptAttempt.attemptId))
    .toThrow('receipt_attempt_not_replayable');
  state = transitionFramedSyncRecovery(state, { attemptId: receiptAttempt.attemptId,
    transferId, type: 'receipt_attempt_finalized' });
  const restarted = structuredClone(state);
  const replayed = replayableReceiptFrames(restarted, transferId, receiptAttempt.attemptId);
  expect(replayed).toHaveLength(1);
  expect(replayed[0]!.sequence).toBe(0n);
  expect([...replayed[0]!.ciphertext]).toEqual([...frame(0n, 16).ciphertext]);
});

it('requires a durable termination request and releases only its transfer member protections', () => {
  const transferA = transfer(17);
  const transferB = transfer(18);
  const protections: TransferProtection[] = [
    { kind: 'hold', memberId: 'member-b', released: false, transferId: transferA },
    { kind: 'pin', memberId: 'member-b', released: false, transferId: transferA },
    { kind: 'hold', memberId: 'member-c', released: false, transferId: transferA },
    { kind: 'pin', memberId: 'member-b', released: false, transferId: transferB }
  ];
  let state = createFramedSyncRecoveryState(protections);
  expect(() => transitionFramedSyncRecovery(state, { memberId: 'member-b',
    transferId: transferA, type: 'termination_acknowledged' }))
    .toThrow('termination_request_not_durable');
  state = transitionFramedSyncRecovery(state, { memberId: 'member-b',
    transferId: transferA, type: 'termination_request_persisted' });
  const timedOut = transitionFramedSyncRecovery(state, { memberId: 'member-b',
    transferId: transferA, type: 'timeout_elapsed' });
  expect(timedOut.protections).toEqual(protections);

  state = transitionFramedSyncRecovery(timedOut, { memberId: 'member-b',
    transferId: transferA, type: 'termination_acknowledged' });
  expect(state.protections.map((value) => value.released)).toEqual([true, true, false, false]);
});
