import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { SyncIdentityDirectionalFactSelection,
  SelectedSyncIdentityVersionFact } from './syncIdentityDirectionalFactSelection.js';
import type { SyncParentFact } from './syncPackFactPresence.js';

type Review = SyncIdentityDirectionalFactSelection['reviews'][number];

export interface SyncIdentityDirectionalFactBatch {
  batch_digest: string;
  batch_index: number;
  batch_total: number;
  parents: SyncParentFact[];
  reviews: Review[];
  selection_digest: string;
  source_digest: string;
  versions: SelectedSyncIdentityVersionFact[];
}

export interface SyncIdentityDirectionalFactStage {
  batch_digests: string[];
  batch_total: number;
  parents: SyncParentFact[];
  reviews: Review[];
  selection_digest: string;
  source_digest: string;
  versions: SelectedSyncIdentityVersionFact[];
}

const encoder = new TextEncoder();

function digest(value: unknown) {
  return bytesToHex(sha256(encoder.encode(JSON.stringify(value))));
}

function withoutDigest(batch: SyncIdentityDirectionalFactBatch) {
  const { batch_digest: _digest, ...value } = batch;
  void _digest;
  return value;
}

export function buildSyncIdentityDirectionalFactBatches(
  selection: SyncIdentityDirectionalFactSelection,
  limit = 64
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 64) {
    throw new Error('sync_identity_directional_batch_limit_invalid');
  }
  const entries = [
    ...selection.versions.map((value) => ({ kind: 'version' as const, value })),
    ...selection.parents.map((value) => ({ kind: 'parent' as const, value })),
    ...selection.reviews.map((value) => ({ kind: 'review' as const, value }))
  ];
  const batchTotal = Math.max(1, Math.ceil(entries.length / limit));
  return Array.from({ length: batchTotal }, (_, batchIndex) => {
    const batch: Omit<SyncIdentityDirectionalFactBatch, 'batch_digest'> = {
      batch_index: batchIndex, batch_total: batchTotal,
      selection_digest: selection.selection_digest, source_digest: selection.source_digest,
      versions: [], parents: [], reviews: []
    };
    for (const entry of entries.slice(batchIndex * limit, (batchIndex + 1) * limit)) {
      if (entry.kind === 'version') batch.versions.push(entry.value);
      else if (entry.kind === 'parent') batch.parents.push(entry.value);
      else batch.reviews.push(entry.value);
    }
    return { ...batch, batch_digest: digest(batch) };
  });
}

/** Plain JSON state can be persisted and resumed after restart. */
export function stageSyncIdentityDirectionalFactBatch(
  current: SyncIdentityDirectionalFactStage | null,
  batch: SyncIdentityDirectionalFactBatch
): SyncIdentityDirectionalFactStage {
  if (batch.batch_digest !== digest(withoutDigest(batch)) || batch.batch_total < 1 ||
      batch.batch_index < 0 || batch.batch_index >= batch.batch_total ||
      batch.versions.length + batch.parents.length + batch.reviews.length > 64) {
    throw new Error('sync_identity_directional_batch_invalid');
  }
  if (!current) {
    if (batch.batch_index !== 0) throw new Error('sync_identity_directional_batch_not_contiguous');
    current = { batch_digests: [], batch_total: batch.batch_total,
      selection_digest: batch.selection_digest, source_digest: batch.source_digest,
      versions: [], parents: [], reviews: [] };
  }
  if (current.selection_digest !== batch.selection_digest ||
      current.source_digest !== batch.source_digest || current.batch_total !== batch.batch_total) {
    throw new Error('sync_identity_directional_stage_mismatch');
  }
  const saved = current.batch_digests[batch.batch_index];
  if (saved) {
    if (saved !== batch.batch_digest) throw new Error('sync_identity_directional_replay_mismatch');
    return current;
  }
  if (batch.batch_index !== current.batch_digests.length) {
    throw new Error('sync_identity_directional_batch_not_contiguous');
  }
  return { ...current, batch_digests: [...current.batch_digests, batch.batch_digest],
    versions: [...current.versions, ...batch.versions],
    parents: [...current.parents, ...batch.parents], reviews: [...current.reviews, ...batch.reviews] };
}
