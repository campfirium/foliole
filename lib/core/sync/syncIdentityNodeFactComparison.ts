import { planNodeVersionChain, type ChainVersion } from './nodeVersionChainPlan.js';
import type { SyncParentFact, SyncVersionFact } from './syncPackFactPresence.js';

export interface SyncIdentityNodeFactDescription {
  headId: string;
  nodeId: string;
  parents: SyncParentFact[];
  requirements: Array<{ version_id: string; frozen: number }>;
  reviews: Array<Record<string, unknown> & { op_id: string }>;
  versions: SyncVersionFact[];
}

const REVIEW_COLUMNS = [
  'id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version',
  'reviewed_at', 'due_before', 'stability_before', 'difficulty_before',
  'due_after', 'stability_after', 'difficulty_after'
] as const;

function immutableVersion(fact: SyncVersionFact) {
  return [fact.version_id, fact.object_id, fact.host_name, fact.created_at,
    fact.content_hash, fact.snapshot_metadata];
}

function reviewFact(row: SyncIdentityNodeFactDescription['reviews'][number]) {
  return REVIEW_COLUMNS.map((column) => row[column]);
}

function assertDescription(side: SyncIdentityNodeFactDescription) {
  const ids = new Set<string>();
  for (const fact of side.versions) {
    if (fact.object_id !== side.nodeId || ids.has(fact.version_id)) {
      throw new Error('sync_identity_node_fact_description_invalid');
    }
    ids.add(fact.version_id);
  }
  const slots = new Set<string>();
  for (const edge of side.parents) {
    const slot = JSON.stringify([edge.version_id, edge.ordinal]);
    if (!ids.has(edge.version_id) || !ids.has(edge.parent_version_id) || slots.has(slot)) {
      throw new Error('sync_identity_node_fact_description_invalid');
    }
    slots.add(slot);
  }
  const reviews = new Set<string>();
  for (const row of side.reviews) {
    if (row.node_id !== side.nodeId || reviews.has(row.op_id)) {
      throw new Error('sync_identity_node_fact_description_invalid');
    }
    reviews.add(row.op_id);
  }
}

function assertSameIdentities(left: SyncIdentityNodeFactDescription,
  right: SyncIdentityNodeFactDescription) {
  assertDescription(left);
  assertDescription(right);
  if (left.nodeId !== right.nodeId || left.headId !== right.headId) {
    throw new Error('sync_identity_node_heads_divergent');
  }
  const versions = new Map(left.versions.map((fact) => [fact.version_id, fact]));
  for (const fact of right.versions) {
    const held = versions.get(fact.version_id);
    if (!held) continue;
    if (JSON.stringify(immutableVersion(held)) !== JSON.stringify(immutableVersion(fact)) ||
        held.body_hash !== null && fact.body_hash !== null &&
        held.body_hash !== fact.body_hash) {
      throw new Error(`sync_pack_node_version_immutable_mismatch:${fact.version_id}`);
    }
  }
  const reviews = new Map(left.reviews.map((row) => [row.op_id, row]));
  for (const row of right.reviews) {
    const held = reviews.get(row.op_id);
    if (held && JSON.stringify(reviewFact(held)) !== JSON.stringify(reviewFact(row))) {
      throw new Error(`sync_review_log_op_mismatch:${row.op_id}`);
    }
  }
}

function graphVersion(fact: SyncVersionFact): ChainVersion {
  return { version_id: fact.version_id, object_id: fact.object_id,
    parent_version_id: fact.parent_version_id,
    body_text: fact.body_hash === null ? null : '',
    snapshot_json: fact.body_hash === null ? '{"content":null}' : '{}' };
}

function projected(description: SyncIdentityNodeFactDescription,
  requirements: SyncIdentityNodeFactDescription['requirements']) {
  const protectedIds = new Set([description.headId,
    ...requirements.map((row) => row.version_id)]);
  const frozenIds = new Set(requirements.filter((row) => row.frozen !== 0)
    .map((row) => row.version_id));
  const plan = planNodeVersionChain(description.versions.map(graphVersion),
    description.parents, protectedIds, frozenIds, Number.MAX_SAFE_INTEGER,
    new Set([description.headId]));
  if (plan.skipped || !plan.removed || !plan.relations) {
    throw new Error(`sync_identity_fact_projection_${plan.skipped ?? 'incomplete'}`);
  }
  const requiredBodies = new Set(plan.requiredBodyIds);
  const parents = new Map(plan.relations.map((row) => [row.id, row.parents]));
  const closure = (id: string) => {
    const seen = new Set<string>();
    const visit = (child: string) => {
      for (const parent of parents.get(child) ?? []) if (!seen.has(parent)) {
        seen.add(parent);
        visit(parent);
      }
    };
    visit(id);
    return [...seen].filter((id) => requiredBodies.has(id)).sort();
  };
  const facts = description.versions.filter((row) => requiredBodies.has(row.version_id))
    .map((row) => ({ immutable: immutableVersion(row),
      bodyHash: row.body_hash, ancestors: closure(row.version_id) }))
    .sort((a, b) => String(a.immutable[0]).localeCompare(String(b.immutable[0])));
  const missingPrimary = description.versions.some((row) =>
    requiredBodies.has(row.version_id) && row.parent_version_id !== null &&
    !description.parents.some((edge) => edge.version_id === row.version_id &&
      edge.parent_version_id === row.parent_version_id && edge.ordinal === 0));
  return { facts, missingPrimary };
}

function mergedGraph(left: SyncIdentityNodeFactDescription,
  right: SyncIdentityNodeFactDescription): SyncIdentityNodeFactDescription {
  const versions = new Map<string, SyncVersionFact>();
  const parents = new Map<string, SyncParentFact>();
  for (const side of [left, right]) {
    for (const fact of side.versions) {
      const prior = versions.get(fact.version_id);
      versions.set(fact.version_id, prior && prior.body_hash !== null ? prior : fact);
      if (fact.parent_version_id && !side.parents.some((edge) =>
        edge.version_id === fact.version_id)) {
        parents.set(JSON.stringify([fact.version_id, fact.parent_version_id]),
          { version_id: fact.version_id, parent_version_id: fact.parent_version_id,
            ordinal: 0 });
      }
    }
    for (const edge of side.parents) parents.set(JSON.stringify([
      edge.version_id, edge.parent_version_id]), edge);
  }
  return { ...left, versions: [...versions.values()].map((row) => ({
    ...row, parent_version_id: null })),
    parents: [...parents.values()].sort((a, b) =>
      a.version_id.localeCompare(b.version_id) ||
      a.parent_version_id.localeCompare(b.parent_version_id)) };
}

function needsReviewRepair(side: SyncIdentityNodeFactDescription,
  peer: SyncIdentityNodeFactDescription) {
  const held = new Set(side.reviews.map((row) => row.op_id));
  return peer.reviews.some((row) => !held.has(row.op_id));
}

function missingTerminalVersion(side: SyncIdentityNodeFactDescription,
  evidence: SyncIdentityNodeFactDescription) {
  const held = new Set(side.versions.map((row) => row.version_id));
  const parents = new Set(evidence.parents.map((row) => row.parent_version_id));
  return evidence.versions.some((row) => !parents.has(row.version_id) &&
    !held.has(row.version_id));
}

function missingOriginalRelation(side: SyncIdentityNodeFactDescription,
  evidence: SyncIdentityNodeFactDescription) {
  const versions = new Set(side.versions.map((row) => row.version_id));
  const parents = new Set(side.parents.map((row) =>
    JSON.stringify([row.version_id, row.ordinal, row.parent_version_id])));
  return evidence.parents.some((row) => versions.has(row.version_id) &&
    versions.has(row.parent_version_id) && !parents.has(JSON.stringify([
      row.version_id, row.ordinal, row.parent_version_id])));
}

/** Compare each device against evidence under its own retention obligations. */
export function compareSyncIdentityNodeFacts(left: SyncIdentityNodeFactDescription,
  right: SyncIdentityNodeFactDescription) {
  assertSameIdentities(left, right);
  const evidence = mergedGraph(left, right);
  const requiredLeft = projected(evidence, left.requirements);
  const requiredRight = projected(evidence, right.requirements);
  const ownProjection = (side: SyncIdentityNodeFactDescription,
    required: ReturnType<typeof projected>) => {
    try {
      const held = projected(side, side.requirements);
      return held.missingPrimary || JSON.stringify(held.facts) !== JSON.stringify(required.facts);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('sync_identity_fact_projection_')) {
        return true;
      }
      throw error;
    }
  };
  return { leftNeedsRepair: missingOriginalRelation(left, evidence) || missingTerminalVersion(left, evidence) ||
      ownProjection(left, requiredLeft) || needsReviewRepair(left, right),
    rightNeedsRepair: missingOriginalRelation(right, evidence) || missingTerminalVersion(right, evidence) ||
      ownProjection(right, requiredRight) || needsReviewRepair(right, left) };
}
