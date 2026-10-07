import type { DbPort } from './dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { readFramedSyncPublishedBodyRange } from './framedSyncPublishedBodyRange.js';
import { encodeIdentityFactChunk } from './syncIdentityFactChunk.js';

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

function digest(value: unknown) {
  const text = requiredText(value);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new Error('sync_group_data_digest_required');
  return text;
}

export async function readFramedSyncPublishedBodyRangeOperation(db: DbPort, payload: Record<string, unknown>) {
  const offset = payload.offset;
  if (typeof offset !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(offset) ||
      !Number.isSafeInteger(Number(offset))) throw new Error('body_range_invalid');
  const maxBytes = payload.max_bytes;
  if (typeof maxBytes !== 'number') throw new Error('body_range_invalid');
  const hash = digest(payload.sha256);
  const bytes = await readFramedSyncPublishedBodyRange(db, {
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    groupId: requiredText(payload.group_id),
    senderDeviceId: requiredText(payload.sender_device_id),
    senderLibraryEpoch: requiredText(payload.sender_library_epoch),
    receiverDeviceId: requiredText(payload.receiver_device_id),
    receiverLibraryEpoch: requiredText(payload.receiver_library_epoch)
  }, { transferId: digest(payload.transfer_id), hash, offset: Number(offset), maxBytes });
  return { sha256: hash, offset, byte_length: String(bytes.length), data_base64: encodeIdentityFactChunk(bytes) };
}
