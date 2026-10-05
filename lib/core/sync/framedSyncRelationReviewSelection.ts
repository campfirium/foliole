import { z } from 'zod';

import type { DbPort, DbRow } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import {
  revalidateFramedSyncInventorySource,
  type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry
} from './framedSyncInventory.js';
import {
  framedSyncParentRelationFactId,
  projectFramedSyncParentRelation,
  projectFramedSyncReview
} from './framedSyncRelationReviewFact.js';
import { IDENTITY_REVIEW_COLUMNS } from './syncIdentityFactSourceRows.js';

type InventoryKey = Readonly<{ globalId: string; objectType: string }>;
type SelectionResult =
  | Readonly<{ facts: readonly CanonicalFact[]; kind: 'selected' }>
  | Readonly<{ globalId: string; kind: 'deferred'; objectType: string }>;

export type FramedSyncRelationReviewSelectionInput = Readonly<{
  difference: FramedSyncInventoryDifference;
  port: DbPort;
  readCurrentInventoryEntry: (
    tx: DbPort,
    key: InventoryKey
  ) => Promise<FramedSyncInventoryEntry | null>;
}>;

const relationIdSchema = z.tuple([
  z.string().min(1), z.string().min(1),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
]);

function parseRelationId(value: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('framed_sync_parent_relation_id_invalid'); }
  const [version_id, parent_version_id, ordinal] = relationIdSchema.parse(parsed);
  const row = { ordinal, parent_version_id, version_id };
  if (framedSyncParentRelationFactId(row) !== value) {
    throw new Error('framed_sync_parent_relation_id_invalid');
  }
  return row;
}

function assertRequest(difference: FramedSyncInventoryDifference) {
  if (difference.direction !== 'local_to_remote' || difference.objectType !== 'node') {
    throw new Error('framed_sync_relation_review_difference_invalid');
  }
  for (const [requested, available, error] of [
    [difference.need.requiredRelationIds, difference.sourceSnapshot.requiredRelationIds,
      'framed_sync_parent_relation_request_invalid'],
    [difference.need.reviewFactIds, difference.sourceSnapshot.reviewFactIds,
      'framed_sync_review_request_invalid']
  ] as const) {
    const inventory = new Set(available);
    if (new Set(requested).size !== requested.length || requested.some((id) => !inventory.has(id))) {
      throw new Error(error);
    }
  }
}

async function loadParent(tx: DbPort, nodeId: string, factId: string) {
  const key = parseRelationId(factId);
  const rows = await tx.query<DbRow>(`SELECT version.object_id, parent.version_id,
    parent.parent_version_id, parent.ordinal FROM node_sync_version_parents parent
    JOIN node_sync_versions version ON version.version_id = parent.version_id
    WHERE version.object_id = ? AND parent.version_id = ? AND parent.parent_version_id = ?
      AND parent.ordinal = ?`, [nodeId, key.version_id, key.parent_version_id, key.ordinal]);
  return rows.length === 1 ? projectFramedSyncParentRelation(rows[0]) : null;
}

async function loadReview(tx: DbPort, nodeId: string, opId: string) {
  if (!opId) throw new Error('framed_sync_review_id_invalid');
  const rows = await tx.query<DbRow>(`SELECT ${IDENTITY_REVIEW_COLUMNS.join(', ')}
    FROM review_log WHERE node_id = ? AND op_id = ?`, [nodeId, opId]);
  return rows.length === 1 ? projectFramedSyncReview(rows[0]) : null;
}

async function loadExactFacts(tx: DbPort, difference: FramedSyncInventoryDifference) {
  const facts: CanonicalFact[] = [];
  for (const relationId of difference.need.requiredRelationIds) {
    const fact = await loadParent(tx, difference.globalId, relationId);
    if (!fact) return null;
    facts.push(fact);
  }
  for (const reviewId of difference.need.reviewFactIds) {
    const fact = await loadReview(tx, difference.globalId, reviewId);
    if (!fact) return null;
    facts.push(fact);
  }
  return facts;
}

const deferred = (difference: FramedSyncInventoryDifference): SelectionResult => ({
  globalId: difference.globalId, kind: 'deferred', objectType: difference.objectType
});

/** Use after the caller revalidates the frozen inventory in the same transaction. */
export async function selectFramedSyncRelationReviewFactsWithDbPort(
  tx: DbPort,
  difference: FramedSyncInventoryDifference
): Promise<SelectionResult> {
  assertRequest(difference);
  const facts = await loadExactFacts(tx, difference);
  return facts ? { facts, kind: 'selected' } : deferred(difference);
}

export async function selectFramedSyncRelationReviewFacts(
  input: FramedSyncRelationReviewSelectionInput
): Promise<SelectionResult> {
  assertRequest(input.difference);
  return input.port.transaction(async (tx) => {
    const current = await input.readCurrentInventoryEntry(tx, input.difference);
    const validation = revalidateFramedSyncInventorySource({ currentSource: current ? [current] : [],
      differences: [input.difference], direction: 'local_to_remote' });
    return validation.deferredObjects.length
      ? deferred(input.difference)
      : selectFramedSyncRelationReviewFactsWithDbPort(tx, input.difference);
  });
}
