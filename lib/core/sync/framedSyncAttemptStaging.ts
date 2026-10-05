import {
  failFramedSync,
  framedSyncBigInt,
  framedSyncBytes,
  framedSyncText,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../database/framedSyncStagingSerialization.js';

import type { DbPort, DbRow } from './dbPort.js';
import {
  assertAttemptId,
  assertFramedSyncDigest,
  assertNoncePrefix,
  type PreparedTransferAttempt,
  type StoredEncryptedFrame
} from './framedSyncContract.js';

export type AttemptPurpose = 'receipt' | 'transfer';

function storedFrame(row: DbRow): StoredEncryptedFrame {
  return { ciphertext: framedSyncBytes(row, 'ciphertext'), frameHeader: framedSyncBytes(row, 'frame_header'),
    frameType: Number(row.frame_type), sequence: framedSyncBigInt(row, 'sequence') };
}

function loadAttempt(db: DbPort, transferId: Uint8Array, purpose: AttemptPurpose, attemptId: Uint8Array) {
  return readFramedSyncRow(db, `SELECT * FROM framed_sync_outbound_attempts
    WHERE transfer_id = ? AND purpose = ? AND attempt_id = ?`, [transferId, purpose, attemptId]);
}

export async function persistFramedSyncAttempt(db: DbPort, transferId: Uint8Array,
  purpose: AttemptPurpose, attempt: PreparedTransferAttempt) {
  assertFramedSyncDigest(transferId, 'transfer_id'); assertAttemptId(attempt.attemptId);
  assertNoncePrefix(attempt.noncePrefix);
  return db.transaction(async (tx) => {
    const existing = await loadAttempt(tx, transferId, purpose, attempt.attemptId);
    if (existing) return sameFramedSyncBytes(framedSyncBytes(existing, 'nonce_prefix'), attempt.noncePrefix) &&
      sameFramedSyncBytes(framedSyncBytes(existing, 'preamble'), attempt.preamble)
      ? 'identical' as const : failFramedSync('outbound_attempt_identity_conflict');
    await tx.run(`INSERT INTO framed_sync_outbound_attempts VALUES (?, ?, ?, ?, ?, 'prepared')`,
      [transferId, purpose, attempt.attemptId, attempt.noncePrefix, attempt.preamble]);
    return 'created' as const;
  });
}

export async function commitFramedSyncFrame(db: DbPort, transferId: Uint8Array, purpose: AttemptPurpose,
  attemptId: Uint8Array, value: StoredEncryptedFrame) {
  return db.transaction(async (tx) => {
    const attempt = await loadAttempt(tx, transferId, purpose, attemptId);
    if (!attempt || framedSyncText(attempt, 'state') !== 'prepared') failFramedSync('outbound_attempt_not_prepared');
    const existing = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_outbound_frames
      WHERE transfer_id = ? AND purpose = ? AND attempt_id = ? AND sequence = ?`,
    [transferId, purpose, attemptId, value.sequence.toString()]);
    if (existing) return sameFramedSyncBytes(framedSyncBytes(existing, 'ciphertext'), value.ciphertext) &&
      sameFramedSyncBytes(framedSyncBytes(existing, 'frame_header'), value.frameHeader) &&
      Number(existing.frame_type) === value.frameType
      ? 'identical' as const : failFramedSync('outbound_frame_identity_conflict');
    await tx.run('INSERT INTO framed_sync_outbound_frames VALUES (?, ?, ?, ?, ?, ?, ?)',
      [transferId, purpose, attemptId, value.sequence.toString(), value.frameType, value.frameHeader, value.ciphertext]);
    return 'created' as const;
  });
}

export async function finalizeFramedSyncAttempt(db: DbPort, transferId: Uint8Array,
  purpose: AttemptPurpose, attemptId: Uint8Array) {
  return db.transaction(async (tx) => {
    const value = await loadAttempt(tx, transferId, purpose, attemptId);
    if (!value || framedSyncText(value, 'state') === 'abandoned') failFramedSync('outbound_attempt_unavailable');
    if (framedSyncText(value, 'state') === 'replayable') return 'identical' as const;
    await tx.run(`UPDATE framed_sync_outbound_attempts SET state = 'replayable'
      WHERE transfer_id = ? AND purpose = ? AND attempt_id = ?`, [transferId, purpose, attemptId]);
    return 'replayable' as const;
  });
}

export async function loadReplayableFramedSyncFrames(db: DbPort, transferId: Uint8Array,
  purpose: AttemptPurpose, attemptId: Uint8Array) {
  const attempt = await loadAttempt(db, transferId, purpose, attemptId);
  if (!attempt || framedSyncText(attempt, 'state') !== 'replayable') failFramedSync('outbound_attempt_not_replayable');
  const rows = await db.query<DbRow>(`SELECT * FROM framed_sync_outbound_frames
    WHERE transfer_id = ? AND purpose = ? AND attempt_id = ? ORDER BY length(sequence), sequence`,
  [transferId, purpose, attemptId]);
  return rows.map(storedFrame);
}
