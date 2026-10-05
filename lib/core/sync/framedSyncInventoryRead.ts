import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { framedSyncParentRelationFactId } from './framedSyncRelationReviewFact.js';
import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';

type InventoryKey = Readonly<{ globalId: string; objectType: string }>;

interface NodeRow extends DbRow {
  body_text: string | null;
  content_hash: string;
  current_version_id: string;
  id: string;
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

const encoder = new TextEncoder();

function nodeSql(key?: InventoryKey) {
  return `SELECT node.id, node.current_version_id, version.body_text, version.content_hash
    FROM nodes node JOIN node_sync_versions version
      ON version.version_id = node.current_version_id
    ${key ? "WHERE node.id = ?" : ''}
    ORDER BY node.id`;
}

async function loadRelatedFacts(port: DbPort, nodeIds: readonly string[]) {
  if (!nodeIds.length) return { parents: [] as ParentRow[], reviews: [] as ReviewRow[] };
  const placeholders = nodeIds.map(() => '?').join(', ');
  const [parents, reviews] = await Promise.all([
    port.query<ParentRow>(`SELECT version.object_id AS node_id, parent.version_id,
      parent.parent_version_id, parent.ordinal FROM node_sync_version_parents parent
      JOIN node_sync_versions version ON version.version_id = parent.version_id
      WHERE version.object_id IN (${placeholders})
      ORDER BY version.object_id, parent.version_id, parent.ordinal, parent.parent_version_id`, nodeIds),
    port.query<ReviewRow>(`SELECT node_id, op_id FROM review_log
      WHERE node_id IN (${placeholders}) ORDER BY node_id, op_id`, nodeIds)
  ]);
  return { parents, reviews };
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

function entry(row: NodeRow, parents: readonly ParentRow[], reviews: readonly ReviewRow[]):
FramedSyncInventoryEntry {
  if (!/^[a-f0-9]{64}$/u.test(row.content_hash)) {
    throw new Error('framed_sync_inventory_state_hash_invalid');
  }
  return {
    frontierFactIds: [row.current_version_id],
    globalId: row.id,
    objectType: 'node',
    requiredRelationIds: parents.map(framedSyncParentRelationFactId),
    resourceHashes: [sha256(encoder.encode(row.body_text ?? ''))],
    reviewFactIds: reviews.map((review) => review.op_id),
    sharedStateHash: hexToBytes(row.content_hash)
  };
}

async function read(port: DbPort, key?: InventoryKey) {
  if (key && key.objectType !== 'node') return [];
  const rows = await port.query<NodeRow>(nodeSql(key), key ? [key.globalId] : []);
  const related = await loadRelatedFacts(port, rows.map((row) => row.id));
  const parents = groupByNode(related.parents);
  const reviews = groupByNode(related.reviews);
  return rows.map((row) => entry(row, parents.get(row.id) ?? [], reviews.get(row.id) ?? []))
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
