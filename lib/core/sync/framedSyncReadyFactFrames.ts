import { framedSyncBytes } from '../database/framedSyncStagingSerialization.js';

import type { DbPort, DbRow } from './dbPort.js';
import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import { decodeAndValidateProtocolMessage } from './framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from './framedSyncWireFact.js';

export type FramedSyncReadyFactSource = 'desktop' | 'android' | 'ios';
const tables = {
  desktop: 'framed_sync_inbound_frames',
  android: 'framed_android.framed_sync_android_frames',
  ios: 'framed_ios.framed_sync_ios_frames'
} as const;
type ReadyFactFrame = DbRow & { sequence: string };

/** Caller retains ready ownership and validates the recovered facts against its authenticated manifest. */
export async function* streamFramedSyncReadyFactFrames(db: DbPort, transferId: Uint8Array,
  attemptId: Uint8Array, source: FramedSyncReadyFactSource) {
  let after: string | null = null;
  for (;;) {
    const frames: ReadyFactFrame[] = await db.query<ReadyFactFrame>(`SELECT sequence, authenticated_plaintext
      FROM ${tables[source]} WHERE transfer_id = ? AND attempt_id = ? AND frame_type = ?
        AND (? IS NULL OR length(sequence) > ? OR
          (length(sequence) = ? AND sequence COLLATE BINARY > ?))
      ORDER BY length(sequence), sequence COLLATE BINARY LIMIT 1`,
    [transferId, attemptId, FRAMED_SYNC_FRAME_TYPES.fact, after, after?.length ?? null,
      after?.length ?? null, after]);
    const frame: ReadyFactFrame | undefined = frames[0];
    if (!frame) return;
    const fact = canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(
      framedSyncBytes(frame, 'authenticated_plaintext'), FRAMED_SYNC_FRAME_TYPES.fact));
    after = frame.sequence;
    yield { sequence: frame.sequence, fact };
  }
}

export async function readFramedSyncReadyFactFrames(db: DbPort, transferId: Uint8Array,
  attemptId: Uint8Array, source: FramedSyncReadyFactSource) {
  const facts: ReturnType<typeof canonicalFactFromValidatedMessage>[] = [];
  for await (const { fact } of streamFramedSyncReadyFactFrames(db, transferId, attemptId, source)) facts.push(fact);
  return facts;
}
