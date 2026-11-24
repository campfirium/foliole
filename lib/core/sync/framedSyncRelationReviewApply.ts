import { recomputeReceivedReviewsWithDb } from '../database/reviewProjection.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import {
  restoreFramedSyncParentRelation,
  restoreFramedSyncReview,
  type FramedSyncParentRelationSource,
  type FramedSyncReviewSource
} from './framedSyncRelationReviewFact.js';

type ParentResolutionRow = DbRow & {
  child_owner: string | null;
  parent_owner: string | null;
  tombstone: string | null;
  existing_parent: string | null;
  existing_ordinal: number | null;
};
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

async function applyParent(tx: DbPort, factId: string, row: FramedSyncParentRelationSource) {
  const resolved = await tx.query<ParentResolutionRow>(
    `WITH incoming(version_id, parent_version_id, object_id, ordinal) AS (VALUES (?, ?, ?, ?))
     SELECT child.object_id AS child_owner, parent.object_id AS parent_owner, tomb.version_id AS tombstone,
       edge.parent_version_id AS existing_parent, edge.ordinal AS existing_ordinal
     FROM incoming
     LEFT JOIN node_sync_versions child ON child.version_id = incoming.version_id
     LEFT JOIN node_sync_versions parent ON parent.version_id = incoming.parent_version_id
     LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = incoming.object_id AND tomb.version_id = incoming.version_id
     LEFT JOIN node_sync_version_parents edge ON edge.version_id = incoming.version_id
       AND (edge.parent_version_id = incoming.parent_version_id OR edge.ordinal = incoming.ordinal)`,
    [row.version_id, row.parent_version_id, row.object_id, row.ordinal]
  );
  const match = resolved[0]!;
  // A standalone tombstone already names its parent. A reclaimed parent is a valid gap.
  if (match.child_owner === null && match.tombstone !== null) return;
  if (match.child_owner === null) throw new Error(`framed_sync_parent_relation_version_missing:${row.version_id}`);
  if (match.child_owner !== row.object_id) throw new Error(`framed_sync_parent_relation_node_mismatch:${row.version_id}`);
  if (match.parent_owner !== null && match.parent_owner !== row.object_id) {
    throw new Error(`framed_sync_parent_relation_node_mismatch:${row.parent_version_id}`);
  }
  if (match.existing_parent !== null) {
    if (resolved.length === 1 && match.existing_parent === row.parent_version_id && match.existing_ordinal === row.ordinal) return;
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
    if (existing.length === 1 && existing[0]!.op_id === row.op_id && sameReview(existing[0]!, row)) return false;
    throw new Error(`framed_sync_review_conflict:${row.op_id}`);
  }
  const [node] = await tx.query('SELECT 1 FROM nodes WHERE id = ? LIMIT 1', [row.node_id]);
  if (!node) {
    const [deleted] = await tx.query('SELECT 1 FROM node_sync_tombstones WHERE node_id = ?', [row.node_id]);
    if (deleted) return false;
    throw new Error(`framed_sync_review_node_missing:${row.node_id}`);
  }
  await tx.run(
    `INSERT INTO review_log (${REVIEW_COLUMNS.join(', ')}) VALUES (${REVIEW_COLUMNS.map(() => '?').join(', ')})`,
    REVIEW_COLUMNS.map((column) => row[column])
  );
  return true;
}

/** Apply inside the caller's business transaction so facts and its receipt commit atomically. */
export async function applyFramedSyncRelationReviewFactsWithDbPort(
  tx: DbPort,
  facts: readonly CanonicalFact[],
  pendingReviews?: Set<string>
) {
  const affected = pendingReviews ?? new Set<string>();
  const decoded = facts.map(decodeFact);
  for (const fact of decoded) {
    if (fact.kind === 'parent') await applyParent(tx, fact.factId, fact.row);
    else if (await applyReview(tx, fact.row)) affected.add(fact.row.node_id);
  }
  if (!pendingReviews) await recomputeReceivedReviewsWithDb(tx, affected);
}
