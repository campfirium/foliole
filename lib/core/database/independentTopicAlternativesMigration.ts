import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import type { DbPort, DbParams } from '../sync/dbPort.js';
import { buildRemoteNodeVersionUpsert } from '../sync/syncNodeApplyStatements.js';
import { buildResolutionRecord } from '../sync/syncNodeResolution.js';
import { alternativeImageFacts } from '../sync/topicAlternativeConflict.js';
import { topicAlternativeHash, type TopicAlternativeRecord } from '../sync/topicAlternativeRecord.js';
import { resolveTopicAlternative } from '../sync/topicAlternativeStore.js';
import { validateTopicTextBodies } from '../sync/topicTextBodies.js';
import { normalizeTextAlternativesForHash, TEXT_ALTERNATIVE_LIFETIME_MS, type TopicTextAlternative, type TopicTextBody } from '../sync/topicTextState.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';
import { hashTextBody } from './textBodyHash.js';

const COLUMNS = [
  ['body_blob_hash', "TEXT NOT NULL DEFAULT ''"], ['expires_at', "TEXT NOT NULL DEFAULT ''"],
  ['resource_references', "TEXT NOT NULL DEFAULT '[]'"], ['image_sources', 'TEXT']
] as const;
const INDEXES = [
  'DROP INDEX IF EXISTS idx_node_text_alternatives_available_source',
  'DROP INDEX IF EXISTS idx_node_text_alternatives_source_version',
  'CREATE INDEX IF NOT EXISTS idx_node_text_alternatives_active ON node_text_alternatives(node_id, status, created_at)'
];
const OWNERS = `SELECT v.*, n.current_version_id,
  (SELECT COALESCE(main.body_text, json_extract(main.snapshot_json, '$.content')) FROM node_sync_versions main
    WHERE main.version_id = n.current_version_id) AS current_body FROM node_sync_versions v JOIN nodes n ON n.id = v.object_id
  WHERE n.kind = 'topic' AND n.deleted_at IS NULL AND (v.version_id = n.current_version_id OR
    (NOT EXISTS (SELECT 1 FROM node_sync_version_parents edge WHERE edge.parent_version_id = v.version_id)
      AND NOT EXISTS (SELECT 1 FROM node_sync_versions child WHERE child.parent_version_id = v.version_id)))
    AND json_array_length(COALESCE(json_extract(v.snapshot_json, '$.text_alternatives'), '[]')) > 0
  ORDER BY v.object_id, v.version_id`;
type Owner = { version_id: string; object_id: string; current_version_id: string; body_text: string | null;
  current_body: string; content_hash: string; host_name: string; created_at: string; snapshot_json: string };
type Statement = { sql: string; params: DbParams };

function ownerStatements(owner: Owner): Statement[] {
  const stored = JSON.parse(owner.snapshot_json) as NativeSyncNodeRecord['snapshot'] & { text_alternative_bodies?: TopicTextBody[] };
  const snapshot = { ...stored };
  delete snapshot.text_alternative_bodies;
  delete snapshot.text_alternatives;
  const body = owner.body_text ?? snapshot.content;
  if (typeof body !== 'string') throw new Error(`text_alternative_migration_main_unavailable:${owner.version_id}`);
  const source: NativeSyncNodeRecord = { object_id: owner.object_id, object_type: 'node', snapshot, body_text: body,
    ancestor_version_ids: [], version_id: owner.version_id, version_created_at: owner.created_at,
    updated_at: snapshot.updated_at, host_name: owner.host_name, content_hash: owner.content_hash, parent_version_id: null };
  const successor = buildResolutionRecord([source], source, body, snapshot);
  const version = buildRemoteNodeVersionUpsert(successor)!;
  return [version, { sql: 'INSERT OR IGNORE INTO node_sync_version_parents VALUES (?, ?, 0)',
    params: [successor.version_id!, owner.version_id] }, ...currentStatements(owner, successor)];
}

function choiceRecord(source: Pick<NativeSyncNodeRecord, 'object_id' | 'snapshot'>, entry: TopicTextAlternative, body: string): TopicAlternativeRecord {
  // Older membership records did not retain their original source version; do not invent one.
  return { alternative_id: entry.id, node_id: source.object_id,
    source_version_id: '', body_text: body, body_blob_hash: entry.body_blob_hash,
    source_host_name: entry.source_host_name, created_at: entry.created_at, expires_at: entry.expires_at,
    status: 'available', updated_at: new Date(Date.parse(entry.expires_at) - TEXT_ALTERNATIVE_LIFETIME_MS).toISOString(),
    ...alternativeImageFacts(source, body) };
}

function choiceStatements(record: TopicAlternativeRecord): Statement[] {
  return [{ sql: `INSERT INTO node_text_alternatives
    (alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at,
      body_blob_hash, expires_at, resource_references, image_sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(alternative_id) DO UPDATE SET body_text = excluded.body_text, status = excluded.status,
      source_version_id = excluded.source_version_id, source_host_name = excluded.source_host_name, created_at = excluded.created_at,
      body_blob_hash = excluded.body_blob_hash, expires_at = excluded.expires_at, updated_at = excluded.updated_at,
      resource_references = excluded.resource_references, image_sources = excluded.image_sources`,
  params: [record.alternative_id, record.node_id, record.source_version_id, record.body_text, record.source_host_name,
    record.created_at, record.status, record.updated_at, record.body_blob_hash, record.expires_at,
    record.resource_references, record.image_sources] },
  { sql: `INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node_text_alternative', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET content_hash = excluded.content_hash,
      state_seq = excluded.state_seq, updated_at = excluded.updated_at, sync_dirty = 1, deleted_at = NULL`,
  params: [record.alternative_id, topicAlternativeHash(record), record.source_host_name, record.updated_at] }];
}

function currentStatements(owner: Owner, successor: NativeSyncNodeRecord): Statement[] {
  if (owner.current_version_id !== owner.version_id) return [];
  return [{ sql: 'UPDATE nodes SET current_version_id = ? WHERE id = ?', params: [successor.version_id!, owner.object_id] },
    { sql: `UPDATE sync_object_state SET current_version_id = ?, content_hash = ?, sync_dirty = 1,
      state_seq = ${NEXT_SYNC_STATE_SEQ_SQL} WHERE object_type = 'node' AND object_id = ?`,
    params: [successor.version_id!, successor.content_hash!, owner.object_id] }];
}

export function migrateIndependentTopicAlternatives(sqlite: DatabaseMigrationTarget) {
  const columns = sqlite.prepare('PRAGMA table_info(node_text_alternatives)').all() as { name: string }[];
  for (const [name, type] of COLUMNS) if (!columns.some(row => row.name === name)) {
    sqlite.exec(`ALTER TABLE node_text_alternatives ADD COLUMN ${name} ${type}`);
  }
  for (const sql of INDEXES) sqlite.exec(sql);
  const now = new Date().toISOString();
  for (const statement of migrationStatements(sqlite.prepare(OWNERS).all() as Owner[], now)) {
    sqlite.prepare(statement.sql).run(...statement.params);
  }
}

export async function migrateCompanionIndependentTopicAlternatives(db: DbPort) {
  const columns = await db.query<{ name: string }>('PRAGMA table_info(node_text_alternatives)');
  for (const [name, type] of COLUMNS) if (!columns.some(row => row.name === name)) {
    await db.run(`ALTER TABLE node_text_alternatives ADD COLUMN ${name} ${type}`);
  }
  for (const sql of INDEXES) await db.run(sql);
  const now = new Date().toISOString();
  for (const statement of migrationStatements(await db.query<Owner>(OWNERS), now)) {
    await db.run(statement.sql, statement.params);
  }
}

function migrationStatements(owners: Owner[], now: string): Statement[] {
  const records = new Map<string, TopicAlternativeRecord>();
  for (const owner of owners) {
    const stored = JSON.parse(owner.snapshot_json) as NativeSyncNodeRecord['snapshot'] & { text_alternative_bodies?: TopicTextBody[] };
    const entries = (stored.text_alternatives ?? []).filter(entry => entry.expires_at > now);
    const bodies = validateTopicTextBodies(entries, stored.text_alternative_bodies ?? []);
    for (const entry of entries) {
      const record = choiceRecord({ object_id: owner.object_id, snapshot: stored },
        entry, bodies.find(body => body.hash === entry.body_blob_hash)!.text);
      const previous = records.get(entry.id);
      if (previous && (previous.node_id !== record.node_id || previous.body_blob_hash !== record.body_blob_hash)) {
        throw new Error('text_alternative_identity_mismatch');
      }
      records.set(entry.id, previous ? resolveTopicAlternative(previous, record) : record);
    }
  }
  for (const owner of owners) {
    const candidates = [...records.values()].filter(row => row.node_id === owner.object_id);
    const selected = new Set(normalizeTextAlternativesForHash(candidates.map(row => ({
      id: row.alternative_id, body_blob_hash: row.body_blob_hash, source_host_name: row.source_host_name,
      created_at: row.created_at, expires_at: row.expires_at
    })), hashTextBody(owner.current_body), now).map(entry => entry.id));
    for (const row of candidates) if (!selected.has(row.alternative_id)) records.set(row.alternative_id,
      { ...row, status: 'superseded', body_text: '', resource_references: '[]', image_sources: null });
  }
  return [...[...records.values()].flatMap(choiceStatements), ...owners.flatMap(ownerStatements)];
}
