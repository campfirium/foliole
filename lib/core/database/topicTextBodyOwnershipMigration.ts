import type { DbPort } from '../sync/dbPort.js';
import { readTopicTextSnapshot, validateTopicTextBodies } from '../sync/topicTextBodies.js';
import { textAlternativesSchema, type TopicTextBody } from '../sync/topicTextState.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

const NEXT_VERSION = `SELECT version_id, snapshot_json FROM node_sync_versions WHERE version_id > ?
  AND (body_text IS NOT NULL OR json_type(snapshot_json, '$.content') IS NULL
    OR json_type(snapshot_json, '$.content') = 'text') ORDER BY version_id LIMIT 1`;
const BODY = 'SELECT data FROM content_blob_data WHERE hash = ?';
const STORE = 'UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?';
type Version = { version_id: string; snapshot_json: string };
type BodyRow = { data: Uint8Array | string };

function bodyText(row: BodyRow | undefined, hash: string) {
  if (!row) throw new Error(`text_alternative_migration_body_unavailable:${hash}`);
  return typeof row.data === 'string' ? row.data : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(row.data);
}

function pendingBodies(version: Version) {
  const snapshot = JSON.parse(version.snapshot_json) as Record<string, unknown>;
  const entries = textAlternativesSchema.parse(snapshot.text_alternatives ?? []);
  if (!entries.length || snapshot.text_alternative_bodies !== undefined) {
    readTopicTextSnapshot(version.snapshot_json);
    return null;
  }
  return { snapshot, entries };
}

function ownedSnapshot(pending: NonNullable<ReturnType<typeof pendingBodies>>, bodies: TopicTextBody[]) {
  return JSON.stringify({ ...pending.snapshot,
    text_alternative_bodies: validateTopicTextBodies(pending.entries, bodies) });
}

export function migrateTopicTextBodyOwnership(sqlite: DatabaseMigrationTarget) {
  let after = '';
  for (;;) {
    const version = sqlite.prepare(NEXT_VERSION).all(after)[0] as Version | undefined;
    if (!version) return;
    after = version.version_id;
    const pending = pendingBodies(version);
    if (!pending) continue;
    const bodies = pending.entries.map((entry) => ({ hash: entry.body_blob_hash,
      text: bodyText(sqlite.prepare(BODY).all(entry.body_blob_hash)[0] as BodyRow | undefined, entry.body_blob_hash) }));
    sqlite.prepare(STORE).run(ownedSnapshot(pending, bodies), version.version_id);
  }
}

export async function migrateCompanionTopicTextBodyOwnership(db: DbPort) {
  let after = '';
  for (;;) {
    const [version] = await db.query<Version>(NEXT_VERSION, [after]);
    if (!version) return;
    after = version.version_id;
    const pending = pendingBodies(version);
    if (!pending) continue;
    const bodies: TopicTextBody[] = [];
    for (const entry of pending.entries) {
      const [row] = await db.query<BodyRow>(BODY, [entry.body_blob_hash]);
      bodies.push({ hash: entry.body_blob_hash, text: bodyText(row, entry.body_blob_hash) });
    }
    await db.run(STORE, [ownedSnapshot(pending, bodies), version.version_id]);
  }
}
