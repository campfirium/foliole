import { ATTACHMENT_BLOCK_BYTES } from './attachmentBlockReceiver.js';
import { attachmentMessage, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import { encodeRequestSyncMessage, type RequestSyncMessage } from './requestSyncObjectMessages.js';

export const ATTACHMENT_BATCH_LIMITS = Object.freeze({
  payloadBytes: 16 * 1024 * 1024,
  entries: 256,
  frames: 1024,
  metadataBytes: 256 * 1024,
  frameMetadataBytes: 24584
});

/** Ordered permissions bind the candidate resume offset; descriptions may only narrow them. */
export function assertAttachmentBatchQueries(queries: readonly AttachmentRequest[]) {
  const first = queries[0];
  const hashes = new Set<string>();
  if (!first || queries.length > ATTACHMENT_BATCH_LIMITS.entries) throw new Error('attachment_batch_entries_invalid');
  for (const query of queries) {
    const hash = query.storageKey.slice(0, 64);
    if (query.operation !== 'batch_pull' || !query.storageKey || query.state || query.data.length || query.derive ||
        query.storageKeys.length || query.pending || query.parsingPending || query.extractorVersion ||
        query.offset % ATTACHMENT_BLOCK_BYTES !== 0 || hashes.has(hash) ||
        !query.requestId.every((byte, index) => byte === first.requestId[index])) throw new Error('attachment_batch_query_invalid');
    hashes.add(hash);
  }
}

/** Payload and metadata are separately capped; small file tails consume only their actual bytes. */
export class AttachmentBatchBudget {
  payloadBytes = 0;
  metadataBytes = 0;
  frames = 0;

  canRead(length: number) { return length <= ATTACHMENT_BATCH_LIMITS.payloadBytes - this.payloadBytes; }

  account(value: AttachmentRequest, encodedBytes?: number): RequestSyncMessage {
    const metadata = encodedBytes === undefined
      ? encodeRequestSyncMessage(attachmentMessage({ ...value, data: new Uint8Array() })).length + (value.data.length ? 4 : 0)
      : encodedBytes - value.data.length;
    this.frames++;
    this.payloadBytes += value.data.length;
    this.metadataBytes += metadata;
    if (this.frames > ATTACHMENT_BATCH_LIMITS.frames || !this.canRead(0) ||
        metadata < 0 || metadata > ATTACHMENT_BATCH_LIMITS.frameMetadataBytes || this.metadataBytes > ATTACHMENT_BATCH_LIMITS.metadataBytes) {
      throw new Error('attachment_batch_budget_exceeded');
    }
    const message = attachmentMessage(value);
    return ['file_end', 'range_end', 'batch_end'].includes(value.state) ? { ...message, attachmentBoundary: true } : message;
  }
}
