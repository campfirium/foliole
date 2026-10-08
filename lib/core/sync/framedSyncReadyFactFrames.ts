import type { DbPort, DbRow } from './dbPort.js';
import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import { framedSyncFactFrameTable, readFramedSyncFactFrame, type FramedSyncReadyFactSource } from './framedSyncFactFrameReader.js';
import { canonicalFactFromValidatedMessage } from './framedSyncWireFact.js';

export type { FramedSyncReadyFactSource } from './framedSyncFactFrameReader.js';
type ReadyFactFrame = DbRow & { sequence: string };

/** Caller retains ready ownership and validates the recovered facts against its authenticated manifest. */
export async function* streamFramedSyncReadyFactFrames(db: DbPort, transferId: Uint8Array,
  attemptId: Uint8Array, source: FramedSyncReadyFactSource) {
  let after: string | null = null;
  for (;;) {
    const frames: ReadyFactFrame[] = await db.query<ReadyFactFrame>(`SELECT sequence
      FROM ${framedSyncFactFrameTable(source)} WHERE transfer_id = ? AND attempt_id = ? AND frame_type = ?
        AND (? IS NULL OR length(sequence) > ? OR
          (length(sequence) = ? AND sequence COLLATE BINARY > ?))
      ORDER BY length(sequence), sequence COLLATE BINARY LIMIT 1`,
    [transferId, attemptId, FRAMED_SYNC_FRAME_TYPES.fact, after, after?.length ?? null,
      after?.length ?? null, after]);
    const frame: ReadyFactFrame | undefined = frames[0];
    if (!frame) return;
    const decoded = await readFramedSyncFactFrame(db, transferId, attemptId, frame.sequence, source);
    const fact = canonicalFactFromValidatedMessage(decoded.message);
    after = decoded.lastSequence.toString();
    yield { sequence: frame.sequence, fact };
  }
}

export async function readFramedSyncReadyFactFrames(db: DbPort, transferId: Uint8Array,
  attemptId: Uint8Array, source: FramedSyncReadyFactSource) {
  const facts: ReturnType<typeof canonicalFactFromValidatedMessage>[] = [];
  for await (const { fact } of streamFramedSyncReadyFactFrames(db, transferId, attemptId, source)) facts.push(fact);
  return facts;
}
