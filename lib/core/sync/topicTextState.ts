import { z } from 'zod';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { hashTextBody } from '../database/textBodyHash.js';

export const TEXT_ALTERNATIVE_LIMIT = 3;
export const TEXT_ALTERNATIVE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export const textAlternativeSchema = z.object({
  id: z.string().min(1),
  body_blob_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  source_host_name: z.string(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime()
});
export const textAlternativesSchema = z.array(textAlternativeSchema).max(TEXT_ALTERNATIVE_LIMIT)
  .refine((entries) => new Set(entries.map((entry) => entry.id)).size === entries.length &&
    new Set(entries.map((entry) => entry.body_blob_hash)).size === entries.length, 'text_alternative_identity_duplicate');
export type TopicTextAlternative = z.infer<typeof textAlternativeSchema>;
export type TopicTextBody = { hash: string; text: string };

export function textAlternatives(record: NativeSyncNodeRecord) {
  return record.snapshot.text_alternatives ?? [];
}

export function availableTextAlternatives(record: NativeSyncNodeRecord, now: string) {
  return textAlternatives(record).filter((entry) => entry.expires_at > now);
}

export function alternativeForBody(record: NativeSyncNodeRecord, formedAt: string): TopicTextAlternative {
  const hash = hashTextBody(record.body_text ?? record.snapshot.content ?? '');
  const origin = record.snapshot.text_selection?.version_id ?? record.version_id;
  return {
    id: `alternative#${hashTextBody(`${record.object_id}\n${origin}\n${hash}`).slice(0, 24)}`,
    body_blob_hash: hash,
    source_host_name: record.host_name ?? 'unknown',
    created_at: record.snapshot.text_selection?.created_at ?? record.version_created_at!,
    expires_at: new Date(Date.parse(formedAt) + TEXT_ALTERNATIVE_LIFETIME_MS).toISOString()
  };
}

export function normalizeTextAlternatives(entries: readonly TopicTextAlternative[], body: string, now: string) {
  const bodyHash = hashTextBody(body);
  const byHash = new Map<string, TopicTextAlternative>();
  for (const entry of entries) {
    if (entry.body_blob_hash === bodyHash || entry.expires_at <= now) continue;
    const previous = byHash.get(entry.body_blob_hash);
    if (!previous || compareAlternative(entry, previous) < 0) byHash.set(entry.body_blob_hash, entry);
  }
  return [...byHash.values()].sort((left, right) =>
    right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id)
  ).slice(0, TEXT_ALTERNATIVE_LIMIT);
}

function compareAlternative(left: TopicTextAlternative, right: TopicTextAlternative) {
  return left.expires_at.localeCompare(right.expires_at) ||
    left.created_at.localeCompare(right.created_at) || left.source_host_name.localeCompare(right.source_host_name);
}
