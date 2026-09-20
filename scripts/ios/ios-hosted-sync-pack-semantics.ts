import { createHash } from 'node:crypto';

import type { SqliteDatabase } from '../../electron/database/connection.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';

export const HOSTED_ORACLE_TABLES = [
  'sync_object_state', 'sync_objects', 'nodes', 'node_sync_versions',
  'node_sync_version_parents', 'node_order', 'node_attachments',
  'external_documents', 'content_blobs', 'review_log'
] as const;

export function hostedPackSemanticDigest(database: SqliteDatabase, alias = 'main') {
  return createHash('sha256').update(JSON.stringify(hostedPackSemanticProjection(database, alias))).digest('hex');
}

export function hostedPackSemanticProjection(database: SqliteDatabase, alias = 'main') {
  return HOSTED_ORACLE_TABLES.map((table) => ({
    rows: database.prepare(`SELECT * FROM ${sqliteIdentifier(alias)}.${sqliteIdentifier(table)}`).all()
      .map((row) => canonicalJson(semanticRow(table, row as Record<string, unknown>))).sort(),
    table
  }));
}

function semanticRow(table: string, row: Record<string, unknown>) {
  // The sync-pack node contract permits legacy packs to omit this nullable field.
  if (table === 'nodes') return { image_sources: null, ...row };
  if (table !== 'sync_objects' || row.object_type !== 'pdf_page_text'
    || row.payload_json == null) return row;
  const payload = JSON.parse(String(row.payload_json));
  if (computeSyncContentHash('pdf_page_text', payload) !== row.content_hash) {
    throw new Error('ios_hosted_oracle_pdf_payload_hash_mismatch');
  }
  return { ...row, payload_json: canonicalJson(payload) };
}

export function sqliteIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error('ios_hosted_oracle_identifier_invalid');
  return `"${value}"`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
