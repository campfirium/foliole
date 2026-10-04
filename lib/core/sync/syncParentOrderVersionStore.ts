import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort, DbRow } from './dbPort.js';
import { parentOrderFactStateStatement } from './syncParentOrderFact.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';

export const PARENT_ORDER_VERSION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS parent_order_versions (
    version_id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('baseline', 'membership', 'merge', 'user')),
    child_ids_json TEXT NOT NULL,
    parent_version_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_parent_order_versions_parent
    ON parent_order_versions (parent_id, version_id)`,
  `CREATE TABLE IF NOT EXISTS parent_order_heads (
    parent_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES parent_order_versions(version_id)
  )`
] as const;

export const PARENT_ORDER_BASELINE_TIME = '1970-01-01T00:00:00.000Z';

export function parentOrderBaselineVersionId(parentId: string, order: readonly string[]) {
  if (!parentId || order.some((id) => !id) || new Set(order).size !== order.length) {
    throw new Error('sync_parent_order_version_invalid');
  }
  return `ord_baseline_${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([
    parentId, order
  ]))))}`;
}

interface VersionRow extends DbRow {
  child_ids_json: string;
  created_at: string;
  kind: ParentOrderVersion['kind'];
  parent_id: string;
  parent_version_ids_json: string;
  version_id: string;
}

function parseArray(raw: string): string[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id) ||
      new Set(value).size !== value.length) throw new Error('sync_parent_order_version_invalid');
  return value as string[];
}

function toVersion(row: VersionRow): ParentOrderVersion {
  return { versionId: row.version_id, kind: row.kind,
    order: parseArray(row.child_ids_json),
    parentVersionIds: parseArray(row.parent_version_ids_json) };
}

function toStoredVersion(row: VersionRow) {
  return { parentId: row.parent_id, createdAt: row.created_at, ...toVersion(row) };
}

function assertVersion(version: ParentOrderVersion) {
  if (!version.versionId || !['baseline', 'membership', 'merge', 'user'].includes(version.kind) ||
      version.order.some((id) => !id) || new Set(version.order).size !== version.order.length ||
      version.parentVersionIds.some((id) => !id || id === version.versionId) ||
      new Set(version.parentVersionIds).size !== version.parentVersionIds.length) {
    throw new Error('sync_parent_order_version_invalid');
  }
}

/** Insert an immutable fact; a reused ID with different bytes aborts the caller's transaction. */
export async function insertParentOrderVersion(port: DbPort, parentId: string,
  version: ParentOrderVersion, createdAt: string, lineage: 'complete' | 'staged' = 'complete') {
  assertVersion(version);
  if (!parentId || !createdAt) throw new Error('sync_parent_order_version_invalid');
  const [existing] = await port.query<VersionRow>(`SELECT * FROM parent_order_versions
    WHERE version_id = ?`, [version.versionId]);
  if (existing) {
    if (existing.parent_id !== parentId || existing.kind !== version.kind ||
        existing.child_ids_json !== JSON.stringify(version.order) ||
        existing.parent_version_ids_json !== JSON.stringify(version.parentVersionIds) ||
        existing.created_at !== createdAt) {
      throw new Error('sync_parent_order_fact_collision');
    }
    const state = parentOrderFactStateStatement(parentId, version, createdAt);
    await port.run(state.sql, state.params);
    return false;
  }
  for (const parentVersionId of version.parentVersionIds) {
    const [parent] = await port.query<{ parent_id: string }>(`SELECT parent_id
      FROM parent_order_versions WHERE version_id = ?`, [parentVersionId]);
    if (parent ? parent.parent_id !== parentId : lineage === 'complete') {
      throw new Error('sync_parent_order_lineage_unproven');
    }
  }
  await port.run(`INSERT INTO parent_order_versions
    (version_id, parent_id, kind, child_ids_json, parent_version_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`, [version.versionId, parentId, version.kind,
    JSON.stringify(version.order), JSON.stringify(version.parentVersionIds), createdAt]);
  const state = parentOrderFactStateStatement(parentId, version, createdAt);
  await port.run(state.sql, state.params);
  return true;
}

export async function advanceParentOrderHead(port: DbPort, parentId: string, versionId: string) {
  const [version] = await port.query<{ parent_id: string }>(`SELECT parent_id
    FROM parent_order_versions WHERE version_id = ?`, [versionId]);
  if (version?.parent_id !== parentId) throw new Error('sync_parent_order_head_unproven');
  await port.run(`INSERT INTO parent_order_heads (parent_id, version_id) VALUES (?, ?)
    ON CONFLICT(parent_id) DO UPDATE SET version_id = excluded.version_id`, [parentId, versionId]);
}

export async function readParentOrderVersion(port: DbPort, versionId: string) {
  const [row] = await port.query<VersionRow>(`SELECT * FROM parent_order_versions
    WHERE version_id = ?`, [versionId]);
  return row ? toStoredVersion(row) : null;
}

export async function readParentOrderVersionPage(port: DbPort, parentId: string,
  afterVersionId = '', limit = 128) {
  if (!parentId || !Number.isSafeInteger(limit) || limit < 1 || limit > 128) {
    throw new Error('sync_parent_order_page_invalid');
  }
  const rows = await port.query<VersionRow>(`SELECT * FROM parent_order_versions
    WHERE parent_id = ? AND version_id > ? ORDER BY version_id LIMIT ?`,
  [parentId, afterVersionId, limit + 1]);
  const versions: ReturnType<typeof toStoredVersion>[] = [];
  for (const row of rows.slice(0, limit)) {
    const candidate = toStoredVersion(row);
    if (new TextEncoder().encode(JSON.stringify([...versions, candidate])).length > 65536) {
      if (!versions.length) throw new Error('sync_parent_order_page_item_too_large');
      break;
    }
    versions.push(candidate);
  }
  return { versions, nextAfter: rows.length > versions.length ?
    versions.at(-1)!.versionId : null };
}
