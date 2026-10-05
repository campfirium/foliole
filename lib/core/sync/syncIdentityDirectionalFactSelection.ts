import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { compareSyncIdentityNodeFacts, selectRequiredSyncIdentityNodeFacts,
  type SyncIdentityNodeFactDescription } from './syncIdentityNodeFactComparison.js';
import type { SyncParentFact, SyncVersionFact } from './syncPackFactPresence.js';

export interface SelectedSyncIdentityVersionFact {
  body: boolean;
  fact: SyncVersionFact;
}

export interface SyncIdentityDirectionalFactSelection {
  parents: SyncParentFact[];
  reviews: SyncIdentityNodeFactDescription['reviews'];
  selection_digest: string;
  source_digest: string;
  versions: SelectedSyncIdentityVersionFact[];
}

const encoder = new TextEncoder();

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function terminalRequirements(source: SyncIdentityNodeFactDescription) {
  const ancestors = new Set(source.parents.map((row) => row.parent_version_id));
  return source.versions.filter((row) => !ancestors.has(row.version_id))
    .map((row) => ({ version_id: row.version_id, frozen: 0 }));
}

function canonicalVersion(selected: SelectedSyncIdentityVersionFact) {
  const fact = selected.fact;
  return [fact.body_hash, fact.content_hash, fact.created_at, fact.host_name,
    fact.object_id, fact.parent_version_id, fact.snapshot_metadata, fact.version_id,
    selected.body];
}

function canonicalReview(row: SyncIdentityNodeFactDescription['reviews'][number]) {
  return ['id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version',
    'reviewed_at', 'due_before', 'stability_before', 'difficulty_before',
    'due_after', 'stability_after', 'difficulty_after'].map((key) => row[key]);
}

export function syncIdentityDirectionalSelectionDigest(selection: Omit<
SyncIdentityDirectionalFactSelection, 'selection_digest'>) {
  const material = [selection.source_digest,
    selection.versions.map(canonicalVersion),
    selection.parents.map((row) => [row.version_id, row.ordinal, row.parent_version_id]),
    selection.reviews.map(canonicalReview)];
  return bytesToHex(sha256(encoder.encode(JSON.stringify(material))));
}

/** Select only facts the receiver lacks and the source must still preserve. */
export function selectSyncIdentityDirectionalFacts(args: {
  receiver: SyncIdentityNodeFactDescription;
  source: SyncIdentityNodeFactDescription;
  sourceDigest: string;
}): SyncIdentityDirectionalFactSelection {
  if (!/^[a-f0-9]{64}$/u.test(args.sourceDigest)) {
    throw new Error('sync_identity_source_digest_invalid');
  }
  compareSyncIdentityNodeFacts(args.source, args.receiver);
  const requirements = new Map(args.source.requirements.map((row) => [row.version_id, row]));
  for (const row of terminalRequirements(args.source)) requirements.set(row.version_id, row);
  const required = selectRequiredSyncIdentityNodeFacts(args.source, [...requirements.values()]);
  const receiverVersions = new Map(args.receiver.versions.map((row) => [row.version_id, row]));
  const sourceVersions = new Map(args.source.versions.map((row) => [row.version_id, row]));
  const bodyIds = new Set(required.bodyIds);
  const versions = required.versionIds.flatMap((versionId) => {
    const fact = sourceVersions.get(versionId);
    if (!fact) throw new Error('sync_identity_directional_fact_missing');
    const held = receiverVersions.get(versionId);
    const body = bodyIds.has(versionId) && fact.body_hash !== null && held?.body_hash === null;
    return !held || body ? [{ fact, body: body || !held && bodyIds.has(versionId) && fact.body_hash !== null }] : [];
  }).sort((left, right) => compareText(left.fact.version_id, right.fact.version_id));
  const heldParents = new Set(args.receiver.parents.map((row) => JSON.stringify([
    row.version_id, row.ordinal, row.parent_version_id])));
  const parents = required.parents.filter((row) => !heldParents.has(JSON.stringify([
    row.version_id, row.ordinal, row.parent_version_id]))).sort((left, right) =>
      compareText(left.version_id, right.version_id) || left.ordinal - right.ordinal ||
      compareText(left.parent_version_id, right.parent_version_id));
  const heldReviews = new Set(args.receiver.reviews.map((row) => row.op_id));
  const reviews = args.source.reviews.filter((row) => !heldReviews.has(row.op_id))
    .sort((left, right) => compareText(left.op_id, right.op_id));
  const selected = { source_digest: args.sourceDigest, versions, parents, reviews };
  return { ...selected, selection_digest: syncIdentityDirectionalSelectionDigest(selected) };
}
