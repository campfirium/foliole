import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { AttemptPurpose } from './framedSyncAttemptStaging.js';
import { assertAttemptId, assertFramedSyncDigest, FRAMED_SYNC_PREAMBLE,
  type PreparedTransferAttempt, type StoredEncryptedFrame } from './framedSyncContract.js';
import { decodeFramedSyncFileJson, encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { decodeFrameHeader, decodeFramedSyncPreamble } from './framedSyncFraming.js';

const bytes = z.array(z.number().int().min(0).max(255)).transform((value) => Uint8Array.from(value));
const attemptSchema = z.object({ attemptId: bytes, noncePrefix: bytes, preamble: bytes,
  state: z.enum(['prepared', 'replayable', 'abandoned']), frameCount: z.number().int().nonnegative() });
type FileAttempt = z.infer<typeof attemptSchema>;

function attemptDirectory(transferId: Uint8Array, purpose: AttemptPurpose, attemptId?: Uint8Array) {
  const base = `attempts/${bytesToHex(assertFramedSyncDigest(transferId, 'transfer_id'))}/${purpose}`;
  return attemptId ? `${base}/${bytesToHex(assertAttemptId(attemptId))}` : base;
}

function same(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function assertAttempt(attempt: FileAttempt | PreparedTransferAttempt, transferId: Uint8Array) {
  const preamble = decodeFramedSyncPreamble(attempt.preamble);
  if (preamble.contextKind !== 'transfer' || !same(preamble.contextId, transferId) ||
      !same(preamble.attemptId, attempt.attemptId) || !same(preamble.noncePrefix, attempt.noncePrefix) ||
      preamble.startingSequence !== 0n) throw new Error('outbound_attempt_identity_conflict');
}

async function loadAttempt(files: FramedSyncFilePort, directory: string, transferId: Uint8Array) {
  const data = await files.read(`${directory}/attempt.json`);
  if (!data) return null;
  const attempt = attemptSchema.parse(decodeFramedSyncFileJson(data));
  assertAttempt(attempt, transferId);
  if (!directory.endsWith(`/${bytesToHex(attempt.attemptId)}`)) throw new Error('outbound_attempt_identity_conflict');
  return attempt;
}

function decodeFrame(data: Uint8Array): StoredEncryptedFrame {
  const frameHeader = data.slice(0, FRAMED_SYNC_PREAMBLE.frameHeaderBytes);
  const header = decodeFrameHeader(frameHeader);
  const ciphertext = data.slice(FRAMED_SYNC_PREAMBLE.frameHeaderBytes);
  if (ciphertext.length !== header.ciphertextBytes) throw new Error('outbound_frame_length_mismatch');
  return { frameHeader, ciphertext, frameType: header.frameType, sequence: header.sequence };
}

function encodeFrame(frame: StoredEncryptedFrame) {
  const data = new Uint8Array(frame.frameHeader.length + frame.ciphertext.length);
  data.set(frame.frameHeader); data.set(frame.ciphertext, frame.frameHeader.length);
  const decoded = decodeFrame(data);
  if (decoded.sequence !== frame.sequence || decoded.frameType !== frame.frameType) {
    throw new Error('outbound_frame_identity_conflict');
  }
  return data;
}

function createAttemptWrites(files: FramedSyncFilePort, purpose: AttemptPurpose) {
  return {
    async persist(transferId: Uint8Array, attempt: PreparedTransferAttempt) {
      assertAttempt(attempt, transferId);
      const directory = attemptDirectory(transferId, purpose, attempt.attemptId);
      return files.exclusive(directory, async () => {
        const prior = await loadAttempt(files, directory, transferId);
        if (prior) {
          if (!same(prior.preamble, attempt.preamble)) throw new Error('outbound_attempt_identity_conflict');
          return 'identical' as const;
        }
        await files.write(`${directory}/attempt.json`, encodeFramedSyncFileJson({ ...attempt, frameCount: 0 }));
        return 'created' as const;
      });
    },
    async commit(transferId: Uint8Array, attemptId: Uint8Array, frame: StoredEncryptedFrame) {
      const directory = attemptDirectory(transferId, purpose, attemptId);
      const data = encodeFrame(frame);
      return files.exclusive(directory, async () => {
        const attempt = await loadAttempt(files, directory, transferId);
        if (attempt?.state !== 'prepared') throw new Error('outbound_attempt_not_prepared');
        const key = `${directory}/frames/${frame.sequence}.frame`;
        const prior = await files.read(key);
        if (prior) {
          if (!same(prior, data)) throw new Error('outbound_frame_identity_conflict');
          return 'identical' as const;
        }
        await files.write(key, data);
        return 'created' as const;
      });
    },
  };
}

function createAttemptLifecycle(files: FramedSyncFilePort, purpose: AttemptPurpose) {
  return {
    async finalize(transferId: Uint8Array, attemptId: Uint8Array) {
      const directory = attemptDirectory(transferId, purpose, attemptId);
      return files.exclusive(directory, async () => {
        const attempt = await loadAttempt(files, directory, transferId);
        if (!attempt || attempt.state === 'abandoned') throw new Error('outbound_attempt_unavailable');
        if (attempt.state === 'replayable') return 'identical' as const;
        const names = new Set(await files.list(`${directory}/frames`));
        if (!names.size) throw new Error('outbound_frame_count_missing');
        for (let sequence = 0; sequence < names.size; sequence += 1) {
          if (!names.has(`${sequence}.frame`)) throw new Error('outbound_frame_sequence_gap');
        }
        await files.write(`${directory}/attempt.json`, encodeFramedSyncFileJson({
          ...attempt, state: 'replayable', frameCount: names.size
        }));
        return 'replayable' as const;
      });
    },
    async abandon(transferId: Uint8Array, attemptId: Uint8Array) {
      const directory = attemptDirectory(transferId, purpose, attemptId);
      await files.exclusive(directory, async () => {
        const attempt = await loadAttempt(files, directory, transferId);
        if (!attempt) return;
        await files.write(`${directory}/attempt.json`, encodeFramedSyncFileJson({ ...attempt, state: 'abandoned', frameCount: 0 }));
        await files.remove(`${directory}/frames`);
      });
    },
  };
}

function createAttemptReads(files: FramedSyncFilePort, purpose: AttemptPurpose) {
  return {
    async *stream(transferId: Uint8Array, attemptId: Uint8Array) {
      const directory = attemptDirectory(transferId, purpose, attemptId);
      const attempt = await loadAttempt(files, directory, transferId);
      if (attempt?.state !== 'replayable') throw new Error('outbound_attempt_not_replayable');
      for (let sequence = 0; sequence < attempt.frameCount; sequence += 1) {
        const data = await files.read(`${directory}/frames/${sequence}.frame`);
        if (!data) throw new Error('outbound_frame_sequence_gap');
        const frame = decodeFrame(data);
        if (frame.sequence !== BigInt(sequence)) throw new Error('outbound_frame_sequence_gap');
        yield frame;
      }
    },
    async listReplayable(transferId: Uint8Array) {
      const directory = attemptDirectory(transferId, purpose);
      const attempts: PreparedTransferAttempt[] = [];
      for (const id of await files.list(directory)) {
        if (!/^[a-f0-9]{32}$/u.test(id)) throw new Error('outbound_attempt_identity_conflict');
        const value = await loadAttempt(files, `${directory}/${id}`, transferId);
        if (value?.state === 'replayable') attempts.push({ ...value, state: 'prepared' });
      }
      return attempts;
    }
  };
}

export function createFramedSyncFileAttempts(files: FramedSyncFilePort, purpose: AttemptPurpose) {
  return { ...createAttemptWrites(files, purpose), ...createAttemptLifecycle(files, purpose),
    ...createAttemptReads(files, purpose) };
}
