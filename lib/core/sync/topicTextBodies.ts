import { z } from 'zod';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';
import type { SyncNodeRecordMetadata, SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { textAlternativesSchema, type TopicTextAlternative, type TopicTextBody } from './topicTextState.js';

const bodiesSchema = z.array(z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/u), text: z.string() })).max(3);

export function validateTopicTextBodies(entries: readonly TopicTextAlternative[], bodies: readonly TopicTextBody[]) {
  return entries.map((entry) => {
    const body = bodies.find((value) => value.hash === entry.body_blob_hash);
    if (!body) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
    if (hashTextBody(body.text) !== entry.body_blob_hash) throw new Error('text_alternative_body_hash_mismatch');
    return body;
  });
}

export function readTopicTextSnapshot(snapshotJson: string, readable = true) {
  const stored = JSON.parse(snapshotJson) as NativeSyncNodeRecord['snapshot'] & { text_alternative_bodies?: unknown };
  const { text_alternative_bodies: payload, ...snapshot } = stored;
  const entries = textAlternativesSchema.parse(snapshot.text_alternatives ?? []);
  const supplied = readable ? bodiesSchema.parse(payload ?? []) : [];
  if (supplied.some((body) => !entries.some((entry) => entry.body_blob_hash === body.hash))) {
    throw new Error('text_alternative_pack_body_unreferenced');
  }
  const bodies = validateTopicTextBodies(readable ? entries : [], supplied);
  return { snapshot, bodies };
}

export function serializeTopicTextSnapshot(record: NativeSyncNodeRecord) {
  const snapshot = { ...record.snapshot };
  if (record.body_text === null) return JSON.stringify(snapshot);
  const entries = textAlternativesSchema.parse(snapshot.text_alternatives ?? []);
  const bodies = validateTopicTextBodies(entries, record.alternative_bodies ?? []);
  return JSON.stringify(bodies.length ? { ...snapshot, text_alternative_bodies: bodies } : snapshot);
}

export function mergedTopicTextBodies(entries: readonly TopicTextAlternative[], records: readonly NativeSyncNodeRecord[]) {
  const bodies = records.flatMap((record) => {
    const text = record.body_text ?? record.snapshot.content;
    return [...record.alternative_bodies ?? [], ...typeof text === 'string' ? [{ hash: hashTextBody(text), text }] : []];
  });
  return validateTopicTextBodies(entries, bodies);
}

/** Keep only the selected alternatives, loading each immutable version separately. */
export async function mergedTopicTextSourceBodies<M extends SyncNodeRecordMetadata>(db: DbPort,
  entries: readonly TopicTextAlternative[], source: SyncNodeRecordSource<M>) {
  const selected: TopicTextBody[] = [];
  for (const metadata of source.records) {
    if (entries.every((entry) => selected.some((body) => body.hash === entry.body_blob_hash))) break;
    const record = await source.load(db, metadata);
    const text = record.body_text ?? record.snapshot.content;
    const candidates = [...record.alternative_bodies ?? [], ...typeof text === 'string' ? [{ hash: hashTextBody(text), text }] : []];
    for (const body of candidates) {
      if (entries.some((entry) => entry.body_blob_hash === body.hash) && !selected.some((value) => value.hash === body.hash)) selected.push(body);
    }
  }
  return validateTopicTextBodies(entries, selected);
}
