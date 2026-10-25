import { recomputeNodeReviewWithDb } from '../database/reviewProjection.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import {
  restoreFramedSyncParentRelation,
  restoreFramedSyncReview,
  type FramedSyncParentRelationSource,
  type FramedSyncReviewSource
} from './framedSyncRelationReviewFact.js';

type ParentRow = FramedSyncParentRelationSource & DbRow;
type ReviewRow = FramedSyncReviewSource & DbRow;
type DecodedFact =
  | Readonly<{ factId: string; kind: 'parent'; row: FramedSyncParentRelationSource }>
  | Readonly<{ factId: string; kind: 'review'; row: FramedSyncReviewSource }>;

const REVIEW_COLUMNS = [
  'id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version', 'reviewed_at',
  'kind', 'voids_op_id'
] as const satisfies readonly (keyof FramedSyncReviewSource)[];

function decodeFact(fact: CanonicalFact): DecodedFact {
  if (fact.kind === 3) {
    return { factId: fact.factId, kind: 'parent', row: restoreFramedSyncParentRelation(fact) };
  }
  if (fact.kind === 4) {
    return { factId: fact.factId, kind: 'review', row: restoreFramedSyncReview(fact) };
  }
  throw new Error(`framed_sync_relation_review_fact_kind_invalid:${fact.kind}`);
}

async function assertVersionOwner(tx: DbPort, versionId: string, objectId: string, reclaimable = false) {
  const [version] = await tx.query<{ object_id: string }>(
    'SELECT object_id FROM node_sync_versions WHERE version_id = ? LIMIT 1', [versionId]
  );
  // A parent the group already reclaimed is a valid gap; the edge still records the original identity.
  if (!version && reclaimable) return;
  if (!version) throw new Error(`framed_sync_parent_relation_version_missing:${versionId}`);
  if (version.object_id !== objectId) {
    throw new Error(`framed_sync_parent_relation_node_mismatch:${versionId}`);
  }
}

/** A deletion received without its text is kept only as the tombstone, which already names its parent. */
async function isTombstoneOnlyVersion(tx: DbPort, row: FramedSyncParentRelationSource) {
  const [tomb] = await tx.query(`SELECT 1 AS present FROM node_sync_tombstones WHERE version_id = ? AND node_id = ?
    AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE version_id = ?)`, [row.version_id, row.object_id, row.version_id]);
  return Boolean(tomb);
}

async function applyParent(tx: DbPort, factId: string, row: FramedSyncParentRelationSource) {
  if (await isTombstoneOnlyVersion(tx, row)) return;
  await assertVersionOwner(tx, row.version_id, row.object_id);
  await assertVersionOwner(tx, row.parent_version_id, row.object_id, true);
  const existing = await tx.query<ParentRow>(
    `SELECT version.object_id, parent.version_id, parent.parent_version_id, parent.ordinal
     FROM node_sync_version_parents parent
     JOIN node_sync_versions version ON version.version_id = parent.version_id
     WHERE parent.version_id = ? AND (parent.parent_version_id = ? OR parent.ordinal = ?)`,
    [row.version_id, row.parent_version_id, row.ordinal]
  );
  if (existing.length > 0) {
    if (existing.length === 1 && existing[0]!.parent_version_id === row.parent_version_id &&
        existing[0]!.ordinal === row.ordinal && existing[0]!.object_id === row.object_id) return;
    throw new Error(`framed_sync_parent_relation_conflict:${factId}`);
  }
  await tx.run(
    'INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, ?)',
    [row.version_id, row.parent_version_id, row.ordinal]
  );
}

function sameReview(left: FramedSyncReviewSource, right: FramedSyncReviewSource) {
  return REVIEW_COLUMNS.every((column) => left[column] === right[column]);
}

async function applyReview(tx: DbPort, row: FramedSyncReviewSource) {
  const existing = await tx.query<ReviewRow>(
    `SELECT ${REVIEW_COLUMNS.join(', ')} FROM review_log WHERE op_id = ? OR id = ?`,
    [row.op_id, row.id]
  );
  if (existing.length > 0) {
    if (existing.length === 1 && existing[0]!.op_id === row.op_id && sameReview(existing[0]!, row)) return;
    throw new Error(`framed_sync_review_conflict:${row.op_id}`);
  }
  const [node] = await tx.query('SELECT 1 FROM nodes WHERE id = ? LIMIT 1', [row.node_id]);
  if (!node) throw new Error(`framed_sync_review_node_missing:${row.node_id}`);
  await tx.run(
    `INSERT INTO review_log (${REVIEW_COLUMNS.join(', ')}) VALUES (${REVIEW_COLUMNS.map(() => '?').join(', ')})`,
    REVIEW_COLUMNS.map((column) => row[column])
  );
  await recomputeNodeReviewWithDb(tx, row.node_id);
}

/** Apply inside the caller's business transaction so facts and its receipt commit atomically. */
export async function applyFramedSyncRelationReviewFactsWithDbPort(
  tx: DbPort,
  facts: readonly CanonicalFact[]
) {
  const decoded = facts.map(decodeFact);
  for (const fact of decoded) {
    if (fact.kind === 'parent') await applyParent(tx, fact.factId, fact.row);
    else await applyReview(tx, fact.row);
  }
}
