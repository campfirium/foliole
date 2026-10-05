import { expect, it } from 'vitest';

import { selectSyncIdentityDirectionalFacts,
  syncIdentityDirectionalSelectionDigest,
  type SyncIdentityDirectionalFactSelection } from './syncIdentityDirectionalFactSelection.js';
import { buildSyncIdentityDirectionalFactBatches,
  stageSyncIdentityDirectionalFactBatch } from './syncIdentityDirectionalFactStaging.js';
import type { SyncIdentityNodeFactDescription } from './syncIdentityNodeFactComparison.js';

const SOURCE_DIGEST = 'a'.repeat(64);

function version(id: string, parent: string | null, body: string | null = `body-${id}`) {
  return { version_id: id, object_id: 'node', parent_version_id: parent,
    body_hash: body, content_hash: `content-${id}`, host_name: 'host',
    created_at: '2026-10-05T00:00:00.000Z', snapshot_metadata: '{}' };
}

function review(index: number) {
  return { id: `id-${index}`, op_id: `review-${String(index).padStart(3, '0')}`,
    host_name: 'host', node_id: 'node', grade: 2, scheduler_version: '1',
    reviewed_at: '2026-10-05T00:00:00.000Z', due_before: null,
    stability_before: null, difficulty_before: null,
    due_after: '2026-10-06T00:00:00.000Z', stability_after: 1, difficulty_after: 2 };
}

function descriptions() {
  const source: SyncIdentityNodeFactDescription = {
    nodeId: 'node', headId: 'head',
    versions: [version('base', null), version('head', 'base'), version('hidden', 'base')],
    parents: [
      { version_id: 'head', parent_version_id: 'base', ordinal: 0 },
      { version_id: 'hidden', parent_version_id: 'base', ordinal: 0 }
    ], requirements: [{ version_id: 'head', frozen: 0 }], reviews: [review(1)]
  };
  const receiver: SyncIdentityNodeFactDescription = {
    ...source, versions: [version('base', null), version('head', 'base')],
    parents: [{ version_id: 'head', parent_version_id: 'base', ordinal: 0 }], reviews: []
  };
  return { source, receiver };
}

it('selects an exact missing terminal branch, relation, body, and review', () => {
  const { source, receiver } = descriptions();
  const selected = selectSyncIdentityDirectionalFacts({ source, receiver, sourceDigest: SOURCE_DIGEST });
  expect(selected.versions.map((row) => [row.fact.version_id, row.body])).toEqual([['hidden', true]]);
  expect(selected.parents).toEqual([
    { version_id: 'hidden', parent_version_id: 'base', ordinal: 0 }
  ]);
  expect(selected.reviews.map((row) => row.op_id)).toEqual(['review-001']);
  expect(selected.selection_digest).toMatch(/^[a-f0-9]{64}$/u);
});

it('requests only the body when immutable version metadata is already present', () => {
  const { source, receiver } = descriptions();
  receiver.versions.push(version('hidden', 'base', null));
  receiver.parents.push({ version_id: 'hidden', parent_version_id: 'base', ordinal: 0 });
  receiver.reviews = [...source.reviews];
  const selected = selectSyncIdentityDirectionalFacts({ source, receiver, sourceDigest: SOURCE_DIGEST });
  expect(selected.versions.map((row) => [row.fact.version_id, row.body])).toEqual([['hidden', true]]);
  expect(selected.parents).toEqual([]);
  expect(selected.reviews).toEqual([]);
});

it('keeps the selection digest stable under input order and binds selected values', () => {
  const first = descriptions();
  const second = descriptions();
  second.source.versions.reverse();
  second.source.parents.reverse();
  const left = selectSyncIdentityDirectionalFacts({ ...first, sourceDigest: SOURCE_DIGEST });
  const right = selectSyncIdentityDirectionalFacts({ ...second, sourceDigest: SOURCE_DIGEST });
  expect(right.selection_digest).toBe(left.selection_digest);
  right.reviews[0]!.grade = 3;
  expect(syncIdentityDirectionalSelectionDigest(right)).not.toBe(left.selection_digest);
});

it('segments at 64 facts and resumes staged batches after restart', () => {
  const partial = { source_digest: SOURCE_DIGEST, versions: [], parents: [],
    reviews: Array.from({ length: 130 }, (_, index) => review(index)) };
  const selection: SyncIdentityDirectionalFactSelection = { ...partial,
    selection_digest: syncIdentityDirectionalSelectionDigest(partial) };
  const batches = buildSyncIdentityDirectionalFactBatches(selection);
  expect(batches.map((batch) => batch.versions.length + batch.parents.length + batch.reviews.length))
    .toEqual([64, 64, 2]);
  let staged = stageSyncIdentityDirectionalFactBatch(null, batches[0]!);
  staged = JSON.parse(JSON.stringify(staged)) as typeof staged;
  staged = stageSyncIdentityDirectionalFactBatch(staged, batches[1]!);
  expect(stageSyncIdentityDirectionalFactBatch(staged, batches[0]!)).toBe(staged);
  staged = stageSyncIdentityDirectionalFactBatch(staged, batches[2]!);
  expect(staged.reviews).toHaveLength(130);
  expect(staged.batch_digests).toHaveLength(3);
});

it('rejects skipped and mutated batch replays', () => {
  const partial = { source_digest: SOURCE_DIGEST, versions: [], parents: [],
    reviews: Array.from({ length: 65 }, (_, index) => review(index)) };
  const selection: SyncIdentityDirectionalFactSelection = { ...partial,
    selection_digest: syncIdentityDirectionalSelectionDigest(partial) };
  const batches = buildSyncIdentityDirectionalFactBatches(selection);
  expect(() => stageSyncIdentityDirectionalFactBatch(null, batches[1]!))
    .toThrow('sync_identity_directional_batch_not_contiguous');
  const staged = stageSyncIdentityDirectionalFactBatch(null, batches[0]!);
  expect(() => stageSyncIdentityDirectionalFactBatch(staged, {
    ...batches[0]!, reviews: [review(999)]
  })).toThrow('sync_identity_directional_batch_invalid');
});
