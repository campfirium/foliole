import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { readFramedSyncNodeResources } from './framedSyncNodeResources.js';
import { framedSyncParentRelationFactId } from './framedSyncRelationReviewFact.js';
import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';

type InventoryKey = Readonly<{ globalId: string; objectType: string }>;

interface NodeRow extends DbRow {
  body_text: string | null;
  content_hash: string;
  current_version_id: string;
  id: string;
  is_tombstone: number;
  resource_references: string;
}

interface ParentRow extends DbRow {
  node_id: string;
  ordinal: number;
  parent_version_id: string;
  version_id: string;
}

interface ReviewRow extends DbRow {
  node_id: string;
  op_id: string;
}

interface StateRow extends DbRow {
  content_hash: string;
  node_id: string;
}

const encoder = new TextEncoder();

function nodeSql(key?: InventoryKey) {
  return `SELECT * FROM (
      SELECT node.id, node.current_version_id, version.body_text, version.content_hash,
        COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]') AS resource_references,
        0 AS is_tombstone
      FROM nodes node JOIN node_sync_versions version
        ON version.version_id = node.current_version_id
      WHERE NOT EXISTS (
        SELECT 1 FROM node_sync_tombstones tombstone WHERE tombstone.node_id = node.id
      )
      UNION ALL
      SELECT tombstone.node_id AS id, tombstone.version_id AS current_version_id,
        NULL AS body_text, tombstone.content_hash,
        COALESCE(json_extract(tombstone.snapshot_json, '$.resource_references'), '[]') AS resource_references,
        1 AS is_tombstone
      FROM node_sync_tombstones tombstone
    ) inventory
    ${key ? 'WHERE inventory.id = ?' : ''}
    ORDER BY inventory.id`;
}

async function loadRelatedFacts(port: DbPort, nodeIds: readonly string[]) {
  if (!nodeIds.length) return {
    parents: [] as ParentRow[], reviews: [] as ReviewRow[], states: [] as StateRow[]
  };
  const placeholders = nodeIds.map(() => '?').join(', ');
  const [parents, reviews, tables] = await Promise.all([
    port.query<ParentRow>(`SELECT version.object_id AS node_id, parent.version_id,
      parent.parent_version_id, parent.ordinal FROM node_sync_version_parents parent
      JOIN node_sync_versions version ON version.version_id = parent.version_id
      WHERE version.object_id IN (${placeholders})
      ORDER BY version.object_id, parent.version_id, parent.ordinal, parent.parent_version_id`, nodeIds),
    port.query<ReviewRow>(`SELECT node_id, op_id FROM review_log
      WHERE node_id IN (${placeholders}) ORDER BY node_id, op_id`, nodeIds),
    port.query<{ name: string }>(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'sync_object_state'`)
  ]);
  const states = tables.length ? await port.query<StateRow>(
    `SELECT object_id AS node_id, content_hash FROM sync_object_state
      WHERE object_type = 'node_reading' AND object_id IN (${placeholders}) ORDER BY object_id`,
    nodeIds
  ) : [];
  return { parents, reviews, states };
}

function groupByNode<Row extends Readonly<{ node_id: string }>>(rows: readonly Row[]) {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const values = grouped.get(row.node_id) ?? [];
    values.push(row);
    grouped.set(row.node_id, values);
  }
  return grouped;
}

function entry(row: NodeRow, parents: readonly ParentRow[], reviews: readonly ReviewRow[],
  states: readonly StateRow[]):
FramedSyncInventoryEntry {
  if (!/^[a-f0-9]{64}$/u.test(row.content_hash)) {
    throw new Error('framed_sync_inventory_state_hash_invalid');
  }
  const bodyText = row.body_text ?? (row.is_tombstone ? '' : null);
  return {
    frontierFactIds: [row.current_version_id],
    globalId: row.id,
    objectType: 'node',
    requiredRelationIds: parents.map(framedSyncParentRelationFactId),
    resourceHashes: [
      ...(bodyText === null ? [] : [sha256(encoder.encode(bodyText))]),
      ...readFramedSyncNodeResources(row.resource_references).map((resource) =>
        hexToBytes(resource.contentHash))
    ],
    reviewFactIds: reviews.map((review) => review.op_id),
    sharedStateHash: hexToBytes(row.content_hash)
    , stateFactIds: states.map((state) => `node_reading:${state.content_hash}`)
  };
}

async function read(port: DbPort, key?: InventoryKey) {
  if (key && key.objectType !== 'node') return [];
  const rows = await port.query<NodeRow>(nodeSql(key), key ? [key.globalId] : []);
  const related = await loadRelatedFacts(port, rows.map((row) => row.id));
  const parents = groupByNode(related.parents);
  const reviews = groupByNode(related.reviews);
  const states = groupByNode(related.states);
  return rows.map((row) => entry(
    row, parents.get(row.id) ?? [], reviews.get(row.id) ?? [], states.get(row.id) ?? []
  ))
    .sort((left, right) => compareSyncIdentityText(left.objectType, right.objectType) ||
      compareSyncIdentityText(left.globalId, right.globalId));
}

export function readFramedSyncInventory(port: DbPort) {
  return port.transaction((tx) => read(tx));
}

export async function readFramedSyncInventoryEntry(port: DbPort, key: InventoryKey) {
  const values = await port.transaction((tx) => read(tx, key));
  return values[0] ?? null;
}
