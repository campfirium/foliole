
import { z } from 'zod';

import { computeSyncContentHash } from '../database/syncState.js';
import { hashTextBody } from '../database/textBodyHash.js';
import { assertTextBodyWithinBudget } from '../nodes/textBodyBudget.js';

export const topicAlternativeRecordSchema = z.object({
  alternative_id: z.string().min(1), node_id: z.string().min(1), source_version_id: z.string(),
  body_text: z.string(), body_blob_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  source_host_name: z.string(), created_at: z.string().datetime(), expires_at: z.string().datetime(),
  resource_references: z.string(), image_sources: z.string().nullable(),
  status: z.enum(['available', 'dismissed', 'promoted', 'superseded', 'expired']),
  updated_at: z.string().datetime()
});

export type TopicAlternativeRecord = z.infer<typeof topicAlternativeRecordSchema>;
export type TopicAlternativeMetadata = Omit<TopicAlternativeRecord, 'body_text'>;

export const TOPIC_ALTERNATIVE_METADATA_COLUMNS = `alternative_id, node_id, source_version_id,
  body_blob_hash, source_host_name, created_at, expires_at, resource_references, image_sources, status, updated_at`;

export function validateTopicAlternativeRecord(value: unknown) {
  const record = topicAlternativeRecordSchema.parse(value);
  assertTextBodyWithinBudget(record.body_text);
  if (record.status !== 'available' && (record.body_text !== '' || record.resource_references !== '[]' || record.image_sources !== null)) {
    throw new Error('text_alternative_retired_body_invalid');
  }
  if (record.status === 'available' && hashTextBody(record.body_text) !== record.body_blob_hash) {
    throw new Error('text_alternative_body_hash_mismatch');
  }
  return record;
}

export function topicAlternativeHash(record: TopicAlternativeMetadata) {
  const metadata = { ...record, body_text: undefined };
  return computeSyncContentHash('node_text_alternative', metadata);
}
