import { isBytes } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../nodes/textBodyBudget.js';
import type { DbPort } from '../sync/dbPort.js';
import { storedSyncNodeVersionBody } from '../sync/syncNodeGraph.js';

import type { DatabaseRow } from './driver.js';
import { isCompanionLegacyPdfImportPlaceholder, isLegacyPdfImportPlaceholder } from './legacyPdfImportPlaceholder.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { partitionCompanionNodeBodyDuringMigration, partitionNodeBodyDuringMigration } from './nodeBodyPartitionMigration.js';
import { projectNodeInlineContent } from './nodeInlineProjection.js';
import { hashTextBody } from './textBodyHash.js';

const NEXT = `SELECT n.id, n.content, n.body_blob_hash, n.sync_dirty, v.object_id, v.body_text, v.snapshot_json,
  EXISTS (SELECT 1 FROM node_version_local_holds h WHERE h.object_id = n.id) AS editing
  FROM nodes n LEFT JOIN node_sync_versions v ON v.version_id = n.current_version_id
  WHERE n.id > ? ORDER BY n.id LIMIT 1`;
const BODY = `SELECT data.data, blob.kind, blob.compression, blob.original_size_bytes, blob.stored_size_bytes
  FROM content_blob_data data JOIN content_blobs blob ON blob.hash = data.hash WHERE data.hash = ?`;
const STORE = 'UPDATE nodes SET content = ? WHERE id = ?';
type Node = { id: string; content: string; body_blob_hash: string | null; sync_dirty: number;
  object_id: string | null; body_text: string | null; snapshot_json: string | null; editing: number };
type Body = { data: Uint8Array; kind: string; compression: string; original_size_bytes: number; stored_size_bytes: number };

function completeBody(node: Node, body?: Body) {
  if (!node.body_blob_hash || hashTextBody(node.content) === node.body_blob_hash) {
    return node.content;
  }
  if (!body || !isBytes(body.data) || body.kind !== 'text_body' || body.compression !== 'none' ||
      body.original_size_bytes !== body.data.byteLength || body.stored_size_bytes !== body.data.byteLength) {
    throw new Error(`node_body_migration_unavailable:${node.id}`);
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body.data);
  if (hashTextBody(text) !== node.body_blob_hash) throw new Error(`node_body_migration_hash_mismatch:${node.id}`);
  return text;
}

function contradictoryInline(node: Node, body: string) {
  return node.content !== '' && node.content !== body && node.content !== projectNodeInlineContent(body);
}

function repairableVersion(node: Node, body: string) {
  if (node.sync_dirty || node.editing || node.object_id !== node.id || !node.snapshot_json) return false;
  const snapshot = JSON.parse(node.snapshot_json) as { body_blob_hash?: string | null };
  const versionBody = storedSyncNodeVersionBody({ body_text: node.body_text, snapshot_json: node.snapshot_json });
  return snapshot.body_blob_hash === node.body_blob_hash && (versionBody === node.content || versionBody === body);
}

/** One known legacy representation is converted inside the normal schema transaction. */
export function migrateNodeBodyOwnership(sqlite: DatabaseMigrationTarget) {
  let after = '';
  for (;;) {
    const node = sqlite.prepare(NEXT).all(after)[0] as Node | undefined;
    if (!node) return;
    after = node.id;
    const body = node.body_blob_hash ? sqlite.prepare(BODY).all(node.body_blob_hash)[0] as Body | undefined : undefined;
    const text = completeBody(node, body);
    if (contradictoryInline(node, text) && !(repairableVersion(node, text) && isLegacyPdfImportPlaceholder({
      queryOne: <T extends DatabaseRow>(sql: string, params = [] as readonly unknown[]) => sqlite.prepare(sql).all(...params)[0] as T | undefined,
      queryAll: <T extends DatabaseRow>(sql: string, params = [] as readonly unknown[]) => sqlite.prepare(sql).all(...params) as T[]
    }, node.id, text))) throw new Error(`node_body_migration_contradictory_inline:${node.id}`);
    if (utf8ByteLength(text) > TEXT_BODY_MAX_BYTES) partitionNodeBodyDuringMigration(sqlite, node.id, text);
    else sqlite.prepare(STORE).run(text, node.id);
  }
}

export async function migrateCompanionNodeBodyOwnership(db: DbPort) {
  let after = '';
  for (;;) {
    const [node] = await db.query<Node>(NEXT, [after]);
    if (!node) return;
    after = node.id;
    const [body] = node.body_blob_hash ? await db.query<Body>(BODY, [node.body_blob_hash]) : [];
    const text = completeBody(node, body);
    if (contradictoryInline(node, text) && !(repairableVersion(node, text) &&
      await isCompanionLegacyPdfImportPlaceholder(db, node.id, text))) {
      throw new Error(`node_body_migration_contradictory_inline:${node.id}`);
    }
    if (utf8ByteLength(text) > TEXT_BODY_MAX_BYTES) await partitionCompanionNodeBodyDuringMigration(db, node.id, text);
    else await db.run(STORE, [text, node.id]);
  }
}
