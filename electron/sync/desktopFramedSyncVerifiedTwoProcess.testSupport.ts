import Database from 'better-sqlite3';

import { loadCurrentVerifiedSyncNode } from '../../lib/core/sync/syncNodeVerifiedGraph.js';
import { readBodyText } from '../../lib/core/sync/verifiedBody.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

export async function verifiedReceiverArticle(databasePath: string, nodeId: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const db = createBetterSqliteDbPort(sqlite);
    const current = await loadCurrentVerifiedSyncNode(db, nodeId);
    if (current?.body.kind !== 'readable') throw new Error('two_process_readable_body_required');
    return { content: await readBodyText(db, current.body.ref), hash: current.body.ref.hash,
      versionId: current.metadata.version_id, contentHash: current.metadata.content_hash };
  } finally { sqlite.close(); }
}

export function verifiedReceiverEvidence(databasePath: string, nodeId: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      continuousTable: sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'content_blob_data'").get(),
      node: sqlite.prepare('SELECT id, content, current_version_id FROM nodes WHERE id = ?').get(nodeId),
      versions: sqlite.prepare('SELECT version_id, body_text, json_extract(snapshot_json, \'$.content\') AS content FROM node_sync_versions WHERE object_id = ?').all(nodeId),
      transfers: sqlite.prepare('SELECT state, header_json, active_attempt_id FROM framed_sync_inbound_transfers ORDER BY rowid').all(),
      receipts: sqlite.prepare('SELECT * FROM framed_sync_receipts ORDER BY rowid').all(),
      pins: sqlite.prepare('SELECT * FROM framed_sync_blob_pins ORDER BY rowid').all(),
      frames: sqlite.prepare('SELECT attempt_id, sequence, authenticated_plaintext FROM framed_sync_inbound_frames ORDER BY rowid').all(),
      available: sqlite.prepare('SELECT * FROM framed_sync_available_blobs ORDER BY rowid').all(),
      chunks: sqlite.prepare('SELECT sha256, byte_offset, length(data) AS byte_length FROM framed_sync_available_blob_chunks ORDER BY byte_offset').all()
    };
  } finally { sqlite.close(); }
}

export function sourceArticleIdentity(databasePath: string, nodeId: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const identity = sqlite.prepare<[string], { versionId: string; contentHash: string }>(
      `SELECT v.version_id AS versionId, v.content_hash AS contentHash FROM nodes n
       JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = ?`).get(nodeId);
    if (!identity) throw new Error('two_process_source_identity_missing');
    return identity;
  } finally { sqlite.close(); }
}
