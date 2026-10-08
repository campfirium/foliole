import type { DbPort } from './dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { iterateFramedSyncFactPayloads } from './framedSyncFactPayloads.js';
import { encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { readFramedSyncPublishedFact } from './framedSyncPublishedFactSource.js';

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

function index(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('framed_sync_fact_index_invalid');
  }
  return value;
}

/** A caller requests one bounded transport payload belonging to the original frozen fact. */
export async function readFramedSyncPublishedFactOperation(db: DbPort, payload: Record<string, unknown>) {
  const factIndex = index(payload.fact_index);
  const fragmentIndex = index(payload.fragment_index);
  const fact = await readFramedSyncPublishedFact(db, {
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: requiredText(payload.group_id),
    senderDeviceId: requiredText(payload.sender_device_id), senderLibraryEpoch: requiredText(payload.sender_library_epoch),
    receiverDeviceId: requiredText(payload.receiver_device_id), receiverLibraryEpoch: requiredText(payload.receiver_library_epoch)
  }, requiredText(payload.transfer_id), factIndex);
  let current = 0;
  for (const value of iterateFramedSyncFactPayloads(fact)) {
    if (current++ !== fragmentIndex) continue;
    const encoded = encodeValidatedProtocolMessage(value.payloadCase, value.payload);
    if (value.payloadCase === 'fact') return { message_bytes: Array.from(encoded), last_fragment: true };
    const fragment = value.payload as { data: Uint8Array; offset: unknown; totalByteLength: unknown };
    return { message_bytes: Array.from(encoded),
      last_fragment: BigInt(String(fragment.offset)) + BigInt(fragment.data.byteLength) === BigInt(String(fragment.totalByteLength)) };
  }
  throw new Error('framed_sync_fact_fragment_index_invalid');
}
