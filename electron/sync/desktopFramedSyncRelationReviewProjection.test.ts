// @vitest-environment node

import { expect, it } from 'vitest';

import { canonicalManifestBytes } from '../../lib/core/sync/framedSyncCanonicalManifest.js';

import {
  desktopFramedSyncParentRelationFactId,
  projectDesktopFramedSyncParentRelation,
  projectDesktopFramedSyncReview,
  restoreDesktopFramedSyncParentRelation,
  restoreDesktopFramedSyncReview,
  type DesktopFramedSyncReviewSource
} from './desktopFramedSyncRelationReviewProjection.js';

const parent = {
  object_id: 'node-1', ordinal: 1, parent_version_id: 'version-parent', version_id: 'version-child'
};

function review(overrides: Partial<DesktopFramedSyncReviewSource> = {}): DesktopFramedSyncReviewSource {
  return {
    difficulty_after: 3.125, difficulty_before: 2.5,
    due_after: '2026-10-08T01:00:00.000Z', due_before: '2026-10-06T01:00:00.000Z',
    grade: 3, host_name: 'device-a', id: 'review-row-1', node_id: 'node-1',
    op_id: 'review-op-1', reviewed_at: '2026-10-05T01:00:00.000Z',
    scheduler_version: 'fsrs-6', stability_after: 4.75, stability_before: 3.5,
    ...overrides
  };
}

it('round-trips the exact parent edge and binds its canonical identity', () => {
  const fact = projectDesktopFramedSyncParentRelation(parent);

  expect(fact).toMatchObject({
    blobs: [], factId: '["version-child","version-parent",1]',
    globalId: 'node-1', kind: 3, objectType: 'node'
  });
  expect(fact.factId).toBe(desktopFramedSyncParentRelationFactId(parent));
  expect(fact.sharedStateHash).toHaveLength(32);
  expect(restoreDesktopFramedSyncParentRelation(fact)).toEqual(parent);
  expect(() => canonicalManifestBytes({ blobs: [], facts: [fact] })).not.toThrow();
});

it('round-trips every immutable review column without floating-point loss', () => {
  const source = review();
  const fact = projectDesktopFramedSyncReview(source);

  expect(fact).toMatchObject({
    blobs: [], factId: 'review-op-1', globalId: 'node-1', kind: 4, objectType: 'node'
  });
  expect(restoreDesktopFramedSyncReview(fact)).toEqual(source);
  expect(fact.body.find((entry) => entry.name === 'stability_after')?.value)
    .toEqual({ kind: 'string', value: '4.75' });
  expect(() => canonicalManifestBytes({ blobs: [], facts: [fact] })).not.toThrow();
});

it('changes the shared hash for shared payload changes and rejects tampering', () => {
  const original = projectDesktopFramedSyncReview(review());
  const changed = projectDesktopFramedSyncReview(review({ grade: 4 }));

  expect(changed.sharedStateHash).not.toEqual(original.sharedStateHash);
  expect(() => restoreDesktopFramedSyncReview({
    ...original,
    body: original.body.map((entry) => entry.name === 'grade'
      ? { ...entry, value: { kind: 'signed', value: 4n } } : entry)
  })).toThrow('framed_sync_relation_review_fact_invalid');
  expect(() => restoreDesktopFramedSyncParentRelation({
    ...projectDesktopFramedSyncParentRelation(parent),
    factId: '["version-child","other",1]'
  })).toThrow('framed_sync_relation_review_fact_invalid');
});
