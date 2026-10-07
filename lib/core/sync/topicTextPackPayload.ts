import { z } from 'zod';

import type { DatabaseDriver } from '../database/driver.js';
import { hashTextBody } from '../database/textBodyHash.js';
import { loadTopicTextBodiesWithDriver } from '../database/topicTextBodiesWithDriver.js';

import type { DbPort } from './dbPort.js';
import { upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';
import { loadTopicTextBody } from './topicTextBodies.js';
import { textAlternativesSchema } from './topicTextState.js';

const bodiesSchema = z.array(z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/u), text: z.string() })).max(3);
const TRANSPORT_FIELD = 'text_alternative_bodies';

/** Pack copies contain bytes; persisted whole versions retain only content-addressed references. */
export function projectTopicTextPackSnapshot(driver: DatabaseDriver, snapshotJson: string, body: string | null) {
  const snapshot = JSON.parse(snapshotJson) as Record<string, unknown>;
  const entries = textAlternativesSchema.parse(snapshot.text_alternatives ?? []);
  if (body === null || !entries.length) return snapshotJson;
  return JSON.stringify({ ...snapshot, [TRANSPORT_FIELD]: loadTopicTextBodiesWithDriver(driver, entries) });
}

export async function retainTopicTextPackSnapshot(db: DbPort, snapshotJson: string, body: string | null, now: string) {
  if (body === null) return;
  const snapshot = JSON.parse(snapshotJson) as Record<string, unknown>;
  const entries = textAlternativesSchema.parse(snapshot.text_alternatives ?? []);
  const bodies = bodiesSchema.parse(snapshot[TRANSPORT_FIELD] ?? []);
  if (bodies.some((body) => !entries.some((entry) => entry.body_blob_hash === body.hash))) {
    throw new Error('text_alternative_pack_body_unreferenced');
  }
  for (const body of bodies) {
    if (hashTextBody(body.text) !== body.hash) throw new Error('text_alternative_body_hash_mismatch');
    await upsertTextBodyBlob(db, body.text, now, body.hash);
  }
  for (const entry of entries) await loadTopicTextBody(db, entry);
}

export function topicTextPackSnapshotSql(version: string, schema: string) {
  return `CASE WHEN ${version}.body_text IS NULL OR
    COALESCE(json_array_length(${version}.snapshot_json, '$.text_alternatives'), 0) = 0
    THEN ${version}.snapshot_json ELSE json_set(${version}.snapshot_json, '$.${TRANSPORT_FIELD}',
      json((SELECT json_group_array(json_object('hash', data.hash, 'text', CAST(data.data AS TEXT)))
        FROM json_each(${version}.snapshot_json, '$.text_alternatives') entry
        JOIN ${schema}.content_blob_data data ON data.hash = json_extract(entry.value, '$.body_blob_hash')))) END`;
}
