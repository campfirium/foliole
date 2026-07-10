import type { DatabaseRow } from '../database/driver.js';

export const SYNC_PACK_NODE_FIELD_DEFINITIONS = [
  { name: 'id', sql: 'TEXT PRIMARY KEY' },
  { name: 'parent_id', sql: 'TEXT' },
  { name: 'kind', sql: 'TEXT NOT NULL' },
  { name: 'priority', sql: 'INTEGER', legacyOptional: true },
  { name: 'desired_retention', sql: 'REAL', legacyOptional: true },
  { name: 'enable_short_term', sql: 'INTEGER', legacyOptional: true },
  { name: 'sequential_reading_enabled', sql: 'INTEGER', legacyOptional: true },
  { name: 'shelved_at', sql: 'TEXT' },
  { name: 'manual_child_order', sql: 'TEXT', legacyOptional: true },
  { name: 'title', sql: 'TEXT NOT NULL' },
  { name: 'is_title_manual', sql: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'hide_title_heading', sql: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'body_blob_hash', sql: 'TEXT' },
  { name: 'opening_text', sql: 'TEXT' },
  { name: 'virtual_filter', sql: 'TEXT', legacyOptional: true },
  { name: 'reveal', sql: 'TEXT', legacyOptional: true },
  { name: 'anchor_link', sql: 'TEXT', legacyOptional: true },
  { name: 'image_regions', sql: 'TEXT', legacyOptional: true },
  { name: 'content', sql: "TEXT NOT NULL DEFAULT ''" },
  { name: 'current_version_id', sql: 'TEXT', legacyOptional: true },
  { name: 'created_at', sql: 'TEXT NOT NULL' },
  { name: 'updated_at', sql: 'TEXT NOT NULL' },
  { name: 'deleted_at', sql: 'TEXT' }
] as const;

export type SyncPackNodeColumn = typeof SYNC_PACK_NODE_FIELD_DEFINITIONS[number]['name'];

export const SYNC_PACK_NODE_COLUMNS = SYNC_PACK_NODE_FIELD_DEFINITIONS.map(
  (field): SyncPackNodeColumn => field.name
);

export const SYNC_PACK_LEGACY_OPTIONAL_NODE_COLUMNS = new Set<SyncPackNodeColumn>(
  SYNC_PACK_NODE_FIELD_DEFINITIONS
    .filter((field) => 'legacyOptional' in field && field.legacyOptional)
    .map((field) => field.name)
);

export interface SyncPackNodeRow extends DatabaseRow {
  anchor_link: string | null;
  body_blob_hash: string | null;
  content: string;
  created_at: string;
  current_version_id: string | null;
  deleted_at: string | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  kind: string;
  manual_child_order: string | null;
  opening_text: string | null;
  parent_id: string | null;
  priority: number | null;
  reveal: string | null;
  sequential_reading_enabled: number | null;
  shelved_at: string | null;
  title: string;
  updated_at: string;
  virtual_filter: string | null;
}

export function buildSyncPackNodesTableSql() {
  const columns = SYNC_PACK_NODE_FIELD_DEFINITIONS.map(
    (field) => `    ${field.name} ${field.sql}`
  ).join(',\n');
  return `CREATE TABLE nodes (\n${columns}\n  )`;
}
