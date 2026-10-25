import { z } from 'zod';

import { ATTACHMENT_BATCH_LIMITS } from '../../../../../../lib/core/sync/attachmentBatchContract.js';
import type { AttachmentBatchCandidate, AttachmentBatchDataResult } from '../../../../../../lib/core/sync/attachmentBatchReceiveContract.js';
import type { NativeAttachmentBatchIdentity } from '../../../../../../lib/platform/nativeAttachmentBatchContract.js';

const length = z.number().int().nonnegative().max(8 * 1024 * 1024 * 1024);
const key = z.string().regex(/^[a-f0-9]{64}\.(png|jpg|gif|webp|pdf|epub|pdftext)$/u);
const blocks = z.number().int().nonnegative().max(ATTACHMENT_BATCH_LIMITS.frames);
const result = z.object({
  entries: z.array(z.object({ storage_key: key, byte_length: length, offset: length,
    state: z.enum(['file_end', 'range_end', 'restart', 'unavailable']), blocks, pending: z.boolean() })).min(1).max(256),
  bytes: z.number().int().nonnegative().max(ATTACHMENT_BATCH_LIMITS.payloadBytes), blocks
});
const common = z.object({ library_key: z.string().min(1), generation_id: z.string().min(1), operation_id: z.string().uuid(),
  capacity: z.literal(4), active_operations: z.number().int().min(0).max(2),
  settlements: z.array(z.object({ sequence: z.number().int().min(1).max(256), outcome: z.enum(['published', 'failed']) })).max(256),
  files: z.array(z.object({ sequence: z.number().int().min(1).max(256), storage_key: key, byte_length: length,
    state: z.enum(['sealed', 'claimed']) })).max(4) });
const snapshot = z.union([
  common.extend({ state: z.enum(['prepared', 'receiving']) }),
  common.extend({ state: z.literal('data_complete'), result }),
  common.extend({ state: z.enum(['data_failed', 'stopped']), error: z.string() }),
  common.extend({ state: z.literal('closed'), outcome: z.literal('complete'), result }),
  common.extend({ state: z.literal('closed'), outcome: z.enum(['failed', 'stopped']), error: z.string() })
]);
export type CompanionAttachmentBatchSnapshot = z.infer<typeof snapshot>;
export const attachmentBatchVerificationSchema = z.object({ verification: z.object({ sequence: z.number().int().min(1).max(256), valid: z.boolean() }) });

export function parseCompanionAttachmentBatchSnapshot(raw: unknown, identity: NativeAttachmentBatchIdentity,
  entries: readonly AttachmentBatchCandidate[]) {
  const value = snapshot.parse(raw);
  if (value.library_key !== identity.library_key || value.generation_id !== identity.generation_id || value.operation_id !== identity.operation_id ||
      new Set(value.settlements.map(receipt => receipt.sequence)).size !== value.settlements.length ||
      value.settlements.some(receipt => value.files.some(file => file.sequence === receipt.sequence)) ||
      new Set(value.files.map(file => file.sequence)).size !== value.files.length ||
      new Set(value.files.map(file => file.storage_key.slice(0, 64))).size !== value.files.length ||
      value.files.some(file => !entries.some(entry => entry.storageKey === file.storage_key))) throw invalid();
  if (value.state === 'closed' && (value.active_operations || value.files.length)) throw invalid();
  return value;
}

export function companionAttachmentBatchResult(value: z.infer<typeof result>, candidates: readonly AttachmentBatchCandidate[]): AttachmentBatchDataResult {
  let payloadBytes = 0, totalBlocks = 0;
  const entries = value.entries.map((entry, index) => {
    const candidate = candidates[index];
    if (!candidate || candidate.storageKey !== entry.storage_key || (index < value.entries.length - 1 && entry.state === 'range_end')) throw invalid();
    if (entry.state === 'file_end' || entry.state === 'range_end') {
      const bytes = entry.offset - candidate.offset;
      if (bytes < 0 || entry.offset > entry.byte_length || entry.pending ||
          (candidate.byteLength && entry.byte_length !== candidate.byteLength) ||
          (entry.state === 'file_end' ? entry.offset !== entry.byte_length : entry.offset >= entry.byte_length || entry.offset % 524288 !== 0) ||
          entry.blocks !== Math.ceil(bytes / 524288)) throw invalid();
      payloadBytes += bytes; totalBlocks += entry.blocks;
    } else {
      if (entry.blocks || entry.offset !== candidate.offset ||
          (entry.state === 'restart' ? entry.byte_length >= candidate.offset || entry.pending : entry.byte_length !== candidate.byteLength)) throw invalid();
    }
    return { storageKey: entry.storage_key, byteLength: entry.byte_length, offset: entry.offset,
      state: entry.state, blocks: entry.blocks, pending: entry.pending };
  });
  if (value.bytes !== payloadBytes || value.blocks !== totalBlocks) throw invalid();
  return { entries, bytes: value.bytes, blocks: value.blocks };
}

function invalid() { return new Error('attachment_batch_native_result_invalid'); }
