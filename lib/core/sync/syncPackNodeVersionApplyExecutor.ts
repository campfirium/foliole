import type { DbPort, DbRow, DbValue } from './dbPort.js';
import type { SyncPackNodeApplyOptions } from './syncPackApplyStatements.js';
import {
  assertValidNodeVersionSnapshot,
  SYNC_PACK_NODE_VERSION_COLUMNS,
  type SyncPackNodeVersionRow
} from './syncPackNodeVersions.js';

export async function applySyncPackNodeVersionsWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  const alias = quoteIdentifier(options.incomingAlias ?? 'inc');
  const incoming = (await port.query(
    `SELECT ${SYNC_PACK_NODE_VERSION_COLUMNS.join(', ')} FROM ${alias}.node_sync_versions`
  )).map(normalizeVersionRow);
  const ordered = validateIncomingDag(incoming);
  await assertIncomingCurrentPointers(port, alias, new Map(ordered.map((row) => [row.version_id, row])));
  for (const row of ordered) {
    await assertExistingVersionMatches(port, row);
    await port.run(
      `INSERT INTO node_sync_versions (${SYNC_PACK_NODE_VERSION_COLUMNS.join(', ')})
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(version_id) DO NOTHING`,
      SYNC_PACK_NODE_VERSION_COLUMNS.map((column) => row[column]) as DbValue[]
    );
  }
}

function normalizeVersionRow(row: DbRow): SyncPackNodeVersionRow {
  const versionId = requireString(row.version_id, 'version_id');
  const normalized: SyncPackNodeVersionRow = {
    version_id: versionId,
    object_id: requireString(row.object_id, 'object_id'),
    parent_version_id: requireNullableString(row.parent_version_id, 'parent_version_id'),
    device_id: requireString(row.device_id, 'device_id'),
    created_at: requireString(row.created_at, 'created_at'),
    content_hash: requireString(row.content_hash, 'content_hash'),
    snapshot_json: requireString(row.snapshot_json, 'snapshot_json')
  };
  assertValidNodeVersionSnapshot(normalized);
  return normalized;
}

function validateIncomingDag(rows: SyncPackNodeVersionRow[]) {
  const byId = new Map(rows.map((row) => [row.version_id, row]));
  const ordered: SyncPackNodeVersionRow[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (row: SyncPackNodeVersionRow) => {
    if (visited.has(row.version_id)) return;
    if (visiting.has(row.version_id)) throw new Error(`sync_pack_node_version_cycle:${row.version_id}`);
    visiting.add(row.version_id);
    if (row.parent_version_id !== null) {
      const parent = byId.get(row.parent_version_id);
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
  versions: Map<string, SyncPackNodeVersionRow>
) {
  const nodes = await port.query<{ current_version_id: unknown; id: unknown }>(
    `SELECT id, current_version_id FROM ${alias}.nodes`
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

async function assertExistingVersionMatches(port: DbPort, incoming: SyncPackNodeVersionRow) {
  const [existing] = await port.query(
    `SELECT ${SYNC_PACK_NODE_VERSION_COLUMNS.join(', ')}
     FROM node_sync_versions WHERE version_id = ? LIMIT 1`,
    [incoming.version_id]
  );
  if (!existing) return;
  const normalized = normalizeVersionRow(existing);
  if (SYNC_PACK_NODE_VERSION_COLUMNS.some((column) => normalized[column] !== incoming[column])) {
    throw new Error(`sync_pack_node_version_immutable_mismatch:${incoming.version_id}`);
  }
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

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
