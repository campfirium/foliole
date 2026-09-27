import type { DbPort, DbRow } from './dbPort.js';
import type { SyncPackNodeApplyOptions } from './syncPackApplyStatements.js';
import { restoreIncomingNodeMergeBases } from './syncPackNodeMergeBaseRestore.js';
import {
  assertValidNodeVersionSnapshot,
  SYNC_PACK_NODE_VERSION_COLUMNS,
  type SyncPackNodeVersionParentRow,
  type SyncPackNodeVersionRow
} from './syncPackNodeVersions.js';

const VERSION_BATCH_SIZE = 16;
type VersionIdentity = Pick<SyncPackNodeVersionRow, 'version_id' | 'object_id'>;

export async function applySyncPackNodeVersionsWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  const alias = quoteIdentifier(options.incomingAlias ?? 'inc');
  const incoming = (await port.query(
    `SELECT version_id, object_id FROM ${alias}.node_sync_versions
     WHERE object_id NOT IN ('special-inbox', 'special-virtual-root')
       AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones tomb WHERE tomb.node_id = object_id)`
  )).map(normalizeVersionIdentity);
  const parents = (await port.query(
    `SELECT parent.version_id, parent.parent_version_id, parent.ordinal
     FROM ${alias}.node_sync_version_parents parent
     JOIN ${alias}.node_sync_versions version ON version.version_id = parent.version_id
     WHERE version.object_id NOT IN ('special-inbox', 'special-virtual-root')
       AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones tomb WHERE tomb.node_id = version.object_id)`
  )).map(normalizeVersionParentRow);
  const ordered = validateIncomingDag(incoming, parents);
  await assertIncomingCurrentPointers(port, alias, new Map(ordered.map((row) => [row.version_id, row])));
  await assertExistingVersionsMatch(port, alias);
  for (let offset = 0; offset < ordered.length; offset += VERSION_BATCH_SIZE) {
    const identities = ordered.slice(offset, offset + VERSION_BATCH_SIZE);
    const rows = (await port.query(
      `SELECT ${SYNC_PACK_NODE_VERSION_COLUMNS.join(', ')} FROM ${alias}.node_sync_versions
       WHERE version_id IN (SELECT value FROM json_each(?))`,
      [JSON.stringify(identities.map((row) => row.version_id))]
    )).map(normalizeVersionRow);
    const byId = new Map(rows.map((row) => [row.version_id, row]));
    for (const identity of identities) {
      const row = byId.get(identity.version_id);
      if (!row) throw new Error(`sync_pack_node_version_missing:${identity.version_id}`);
    }
  }
  await port.run(
    `INSERT INTO main.node_sync_versions (${SYNC_PACK_NODE_VERSION_COLUMNS.join(', ')})
     SELECT ${SYNC_PACK_NODE_VERSION_COLUMNS.map((column) => `incoming.${column}`).join(', ')}
     FROM ${alias}.node_sync_versions incoming
     WHERE ${eligibleVersionFilter('incoming')}
     ON CONFLICT(version_id) DO NOTHING`
  );
  await rehydrateCurrentVersionBodies(port, alias);
  await port.run(
    `INSERT INTO main.node_sync_version_parents (version_id, parent_version_id, ordinal)
     SELECT parent.version_id, parent.parent_version_id, parent.ordinal
     FROM ${alias}.node_sync_version_parents parent
     JOIN ${alias}.node_sync_versions version ON version.version_id = parent.version_id
     WHERE ${eligibleVersionFilter('version')}
     ON CONFLICT(version_id, parent_version_id) DO NOTHING`
  );
  await restoreIncomingNodeMergeBases(port, alias);
}

async function rehydrateCurrentVersionBodies(port: DbPort, alias: string) {
  await port.run(
    `UPDATE main.node_sync_versions AS stored SET
       body_text = ${versionBodySql('incoming')}, snapshot_json = incoming.snapshot_json
     FROM ${alias}.node_sync_versions AS incoming
     WHERE stored.version_id = incoming.version_id
       AND ${eligibleVersionFilter('incoming')}
       AND json_type(stored.snapshot_json, '$.content') = 'null'
       AND ${versionBodySql('incoming')} IS NOT NULL
       AND (EXISTS (SELECT 1 FROM ${alias}.nodes node
         WHERE node.current_version_id = stored.version_id)
         OR EXISTS (SELECT 1 FROM main.nodes node
         WHERE node.current_version_id = stored.version_id))`
  );
}

function normalizeVersionIdentity(row: DbRow): VersionIdentity {
  return {
    version_id: requireString(row.version_id, 'version_id'),
    object_id: requireString(row.object_id, 'object_id')
  };
}

function normalizeVersionRow(row: DbRow): SyncPackNodeVersionRow {
  const versionId = requireString(row.version_id, 'version_id');
  const normalized: SyncPackNodeVersionRow = {
    version_id: versionId,
    object_id: requireString(row.object_id, 'object_id'),
    parent_version_id: requireNullableString(row.parent_version_id, 'parent_version_id'),
    host_name: requireString(row.host_name, 'host_name'),
    created_at: requireString(row.created_at, 'created_at'),
    content_hash: requireString(row.content_hash, 'content_hash'),
    body_text: requireNullableText(row.body_text, 'body_text'),
    snapshot_json: requireString(row.snapshot_json, 'snapshot_json')
  };
  assertValidNodeVersionSnapshot(normalized);
  return normalized;
}

function normalizeVersionParentRow(row: DbRow): SyncPackNodeVersionParentRow {
  const ordinal = row.ordinal;
  if (typeof ordinal !== 'number' || !Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error('sync_pack_node_version_parent_field_invalid:ordinal');
  }
  return {
    version_id: requireString(row.version_id, 'version_id'),
    parent_version_id: requireString(row.parent_version_id, 'parent_version_id'),
    ordinal
  };
}

function validateIncomingDag(
  rows: VersionIdentity[],
  parentRows: SyncPackNodeVersionParentRow[]
) {
  const byId = new Map(rows.map((row) => [row.version_id, row]));
  const parentsByVersion = new Map<string, SyncPackNodeVersionParentRow[]>();
  for (const parentRow of parentRows) {
    const entries = parentsByVersion.get(parentRow.version_id) ?? [];
    entries.push(parentRow);
    parentsByVersion.set(parentRow.version_id, entries);
  }
  const ordered: VersionIdentity[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (row: VersionIdentity) => {
    if (visited.has(row.version_id)) return;
    if (visiting.has(row.version_id)) throw new Error(`sync_pack_node_version_cycle:${row.version_id}`);
    visiting.add(row.version_id);
    const parents = (parentsByVersion.get(row.version_id) ?? []).sort((a, b) => a.ordinal - b.ordinal);
    for (const parentRow of parents) {
      const parent = byId.get(parentRow.parent_version_id);
      if (!parent) throw new Error(`sync_pack_node_version_missing_parent:${row.version_id}`);
      if (parent.object_id !== row.object_id) {
        throw new Error(`sync_pack_node_version_cross_object:${row.version_id}`);
      }
      visit(parent);
    }
    visiting.delete(row.version_id);
    visited.add(row.version_id);
    ordered.push(row);
  };
  rows.forEach(visit);
  return ordered;
}

async function assertIncomingCurrentPointers(
  port: DbPort,
  alias: string,
  versions: Map<string, VersionIdentity>
) {
  const nodes = await port.query<{ current_version_id: unknown; id: unknown }>(
    `SELECT id, current_version_id FROM ${alias}.nodes
     WHERE id NOT IN ('special-inbox', 'special-virtual-root')
       AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones tomb WHERE tomb.node_id = id)`
  );
  for (const node of nodes) {
    const nodeId = requireString(node.id, 'node_id');
    const currentVersionId = requireNullableString(node.current_version_id, 'current_version_id');
    if (currentVersionId === null) continue;
    const version = versions.get(currentVersionId);
    if (!version) throw new Error(`sync_pack_node_current_version_missing:${nodeId}`);
    if (version.object_id !== nodeId) throw new Error(`sync_pack_node_current_version_cross_object:${nodeId}`);
  }
}

async function assertExistingVersionsMatch(port: DbPort, alias: string) {
  const immutableColumns = SYNC_PACK_NODE_VERSION_COLUMNS.filter((column) =>
    !['version_id', 'body_text', 'snapshot_json'].includes(column));
  const mismatch = [
    ...immutableColumns.map((column) => `existing.${column} IS NOT incoming.${column}`),
    `json_remove(existing.snapshot_json, '$.content') IS NOT
      json_remove(incoming.snapshot_json, '$.content')`,
    `(${versionBodySql('existing')} IS NOT NULL AND ${versionBodySql('incoming')} IS NOT NULL
      AND ${versionBodySql('existing')} IS NOT ${versionBodySql('incoming')})`
  ].join(' OR ');
  const [row] = await port.query<{ version_id: string }>(
    `SELECT incoming.version_id FROM ${alias}.node_sync_versions incoming
     JOIN main.node_sync_versions existing ON existing.version_id = incoming.version_id
     WHERE ${eligibleVersionFilter('incoming')} AND (${mismatch}) LIMIT 1`
  );
  if (row) throw new Error(`sync_pack_node_version_immutable_mismatch:${row.version_id}`);
}

function versionBodySql(table: string) {
  return `CASE WHEN ${table}.body_text IS NOT NULL THEN ${table}.body_text
    WHEN json_type(${table}.snapshot_json, '$.content') = 'null' THEN NULL
    WHEN json_type(${table}.snapshot_json, '$.content') IS NULL THEN ''
    WHEN json_type(${table}.snapshot_json, '$.content') = 'text'
      THEN json_extract(${table}.snapshot_json, '$.content')
    ELSE NULL END`;
}

function eligibleVersionFilter(table: string) {
  return `${table}.object_id NOT IN ('special-inbox', 'special-virtual-root')
    AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones tomb WHERE tomb.node_id = ${table}.object_id)`;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`sync_pack_node_version_field_invalid:${field}`);
  }
  return value;
}

function requireNullableString(value: unknown, field: string) {
  if (value === null) return null;
  return requireString(value, field);
}

function requireNullableText(value: unknown, field: string) {
  if (value === null || typeof value === 'string') return value;
  throw new Error(`sync_pack_node_version_field_invalid:${field}`);
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
