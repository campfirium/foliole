import { framedSyncBytes, readFramedSyncHeader, readFramedSyncRow,
  sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { canonicalContentId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_FRAME_TYPES, type PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { prepareInboundApply } from './desktopFramedSyncPreparedInbound.js';
import { wireToFact } from './desktopFramedSyncProcessWire.js';

/** A verified transfer awaiting apply remains authoritative after a receiver restart. */
export async function loadDesktopFramedSyncReadyInbound(input: {
  db: DbPort; published: PublishedTransfer; staging: FramedSyncStagingPort;
}) {
  const row = await readFramedSyncRow(input.db, `SELECT * FROM framed_sync_inbound_transfers
    WHERE transfer_id = ? AND state = 'ready_to_apply'`, [input.published.transferId]);
  if (!row) return null;
  const header = readFramedSyncHeader(row);
  if (!sameFramedSyncBytes(header.published.manifestHash, input.published.manifestHash)) {
    throw new Error('framed_sync_ready_manifest_mismatch');
  }
  const frames = await input.db.query<DbRow>(`SELECT authenticated_plaintext
    FROM framed_sync_inbound_frames WHERE transfer_id = ? AND attempt_id = ? AND frame_type = ?
    ORDER BY length(sequence), sequence`,
  [input.published.transferId, framedSyncBytes(row, 'active_attempt_id'), FRAMED_SYNC_FRAME_TYPES.fact]);
  const facts = frames.map((frame) => wireToFact(decodeAndValidateProtocolMessage(
    framedSyncBytes(frame, 'authenticated_plaintext'), FRAMED_SYNC_FRAME_TYPES.fact).payload));
  if (!sameFramedSyncBytes(await canonicalContentId({ facts, blobs: header.blobs }),
    input.published.contentId)) throw new Error('framed_sync_ready_content_mismatch');
  const blobs = await input.db.query<DbRow>(`SELECT blob.sha256, blob.data
    FROM framed_sync_blob_pins pin JOIN framed_sync_available_blobs blob ON blob.sha256 = pin.sha256
    WHERE pin.transfer_id = ? AND pin.role IN (1, 5)`, [input.published.transferId]);
  return {
    ...prepareInboundApply(facts, blobs.map((blob) => ({
      sha256: framedSyncBytes(blob, 'sha256'), data: framedSyncBytes(blob, 'data')
    }))),
    context: input.published.context, manifestHash: input.published.manifestHash,
    staging: input.staging, transferId: input.published.transferId
  };
}
