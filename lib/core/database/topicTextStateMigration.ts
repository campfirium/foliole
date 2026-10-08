import { z } from 'zod';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import type { DbPort, DbParams } from '../sync/dbPort.js';
import { buildRemoteNodeVersionUpsert } from '../sync/syncNodeApplyStatements.js';
import { buildResolutionRecord } from '../sync/syncNodeResolution.js';
import { normalizeTextAlternatives, TEXT_ALTERNATIVE_LIFETIME_MS } from '../sync/topicTextState.js';

import { migrateFramedSyncInventory, migrateCompanionFramedSyncInventory } from './framedSyncInventoryMigration.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { hashTextBody } from './textBodyHash.js';

const nodeSchema = z.object({ id: z.string(), version_id: z.string(), host_name: z.string(),
  created_at: z.string(), body_text: z.string().nullable(), snapshot_json: z.string(), content_hash: z.string() });
const alternativeSchema = z.object({ node_id: z.string(), body_text: z.string(),
  created_at: z.string(), updated_at: z.string(), source_host_name: z.string() });
const NODES_SQL = `SELECT n.id, v.* FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
  WHERE EXISTS (SELECT 1 FROM node_text_alternatives a WHERE a.node_id = n.id AND a.status = 'available')`;
const ALTERNATIVES_SQL = "SELECT * FROM node_text_alternatives WHERE node_id = ? AND status = 'available'";
type Statement = { sql: string; params: DbParams };

function migrationStatements(nodeValue: unknown, alternativesValue: unknown[], now: string): Statement[] {
  const node = nodeSchema.parse(nodeValue);
  const snapshot: NativeSyncNodeRecord['snapshot'] = JSON.parse(node.snapshot_json);
  const body = node.body_text ?? snapshot.content;
  if (typeof body !== 'string') throw new Error('text_alternative_migration_main_unavailable');
  const alternatives = alternativesValue.map((value) => alternativeSchema.parse(value));
  const entries = alternatives.map((entry) => {
    const hash = hashTextBody(entry.body_text);
    return { id: `alternative#${hashTextBody(`${node.id}\n${hash}`).slice(0, 24)}`,
      body_blob_hash: hash, source_host_name: entry.source_host_name, created_at: entry.created_at,
      expires_at: new Date(Date.parse(entry.updated_at) + TEXT_ALTERNATIVE_LIFETIME_MS).toISOString() };
  });
  const current: NativeSyncNodeRecord = { ancestor_version_ids: [], body_text: body,
    content_hash: node.content_hash, host_name: node.host_name, object_id: node.id, object_type: 'node',
    parent_version_id: null, snapshot, updated_at: snapshot.updated_at,
    version_created_at: node.created_at, version_id: node.version_id };
  const record = buildResolutionRecord([current], current, body, { ...snapshot,
    text_alternatives: normalizeTextAlternatives(entries, body, now),
    text_selection: { version_id: node.version_id, created_at: node.created_at } });
  const hashes = new Set(record.snapshot.text_alternatives?.map((entry) => entry.body_blob_hash));
  record.alternative_bodies = alternatives.filter((entry) => hashes.has(hashTextBody(entry.body_text)))
    .map((entry) => ({ hash: hashTextBody(entry.body_text), text: entry.body_text }));
  const mainHash = hashTextBody(body);
  return bodyStatements([{ body_text: body }, ...alternatives.filter((entry) => hashes.has(hashTextBody(entry.body_text)))], now)
    .concat([{ sql: 'UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?',
      params: [JSON.stringify({ ...snapshot, body_blob_hash: mainHash }), node.version_id] }], versionStatements(record));
}

function bodyStatements(entries: Array<{ body_text: string }>, now: string): Statement[] {
  return entries.flatMap((entry) => {
    const hash = hashTextBody(entry.body_text);
    const data = new TextEncoder().encode(entry.body_text);
    return [{ sql: `INSERT OR IGNORE INTO content_blobs
      (hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
       original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at)
      VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)`,
    params: [hash, `text/${hash}`, data.length, data.length, hash, hash, now, now, now] },
    { sql: 'INSERT OR IGNORE INTO content_blob_data (hash, data) VALUES (?, ?)', params: [hash, data] },
    { sql: 'INSERT OR REPLACE INTO framed_sync_resource_availability (hash, available) VALUES (?, 1)', params: [hash] }];
  });
}

function versionStatements(record: NativeSyncNodeRecord): Statement[] {
  const version = buildRemoteNodeVersionUpsert(record)!;
  return [version, { sql: 'INSERT INTO node_sync_version_parents VALUES (?, ?, 0)',
    params: [record.version_id!, record.parent_version_id!] },
  { sql: 'UPDATE nodes SET current_version_id = ?, updated_at = ?, sync_dirty = 0 WHERE id = ?',
    params: [record.version_id!, record.updated_at, record.object_id] },
  { sql: `UPDATE sync_object_state SET current_version_id = ?, content_hash = ?, updated_at = ?, sync_dirty = 1,
      state_seq = (SELECT high_water + 1 FROM sync_state_sequence WHERE singleton_id = 1)
      WHERE object_type = 'node' AND object_id = ?`,
    params: [record.version_id!, record.content_hash!, record.updated_at, record.object_id] }];
}

const REINDEX_SQL = [
  ...FRAMED_SYNC_INVENTORY_TRIGGERS.map((sql) => `DROP TRIGGER IF EXISTS ${sql.match(/CREATE TRIGGER IF NOT EXISTS (\w+)/u)![1]}`),
  ...FRAMED_SYNC_INVENTORY_TRIGGERS
];

const RETIRE_SQL = [
  'UPDATE node_text_alternatives SET body_text = \'\', status = \'superseded\'',
  "DELETE FROM sync_object_state WHERE object_type = 'node_text_alternative'"
];

export function migrateTopicTextState(sqlite: DatabaseMigrationTarget) {
  for (const sql of REINDEX_SQL) sqlite.exec(sql);
  const now = new Date().toISOString();
  for (const node of sqlite.prepare(NODES_SQL).all()) {
    const row = nodeSchema.parse(node);
    const alternatives = sqlite.prepare(ALTERNATIVES_SQL).all(row.id);
    for (const statement of migrationStatements(row, alternatives, now)) sqlite.prepare(statement.sql).run(...statement.params);
  }
  for (const sql of RETIRE_SQL) sqlite.exec(sql);
  migrateFramedSyncInventory(sqlite);
}

export async function migrateCompanionTopicTextState(db: DbPort) {
  for (const sql of REINDEX_SQL) await db.run(sql);
  const now = new Date().toISOString();
  for (const node of await db.query(NODES_SQL)) {
    const row = nodeSchema.parse(node);
    for (const statement of migrationStatements(row, await db.query(ALTERNATIVES_SQL, [row.id]), now)) {
      await db.run(statement.sql, statement.params);
    }
  }
  for (const sql of RETIRE_SQL) await db.run(sql);
  await migrateCompanionFramedSyncInventory(db);
}
