import { expect, it } from 'vitest';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { laterNodeRecord, mergeNodeSnapshot, type NodeSnapshotMetadata } from './syncNodeSnapshotMerge.js';

function record(version: string, time: string): NativeSyncNodeRecord {
  return { ancestor_version_ids: [], body_text: 'Original body', content_hash: 'body-hash',
    host_name: 'host', object_id: 'node', object_type: 'node', parent_version_id: null,
    version_id: version, version_created_at: time, updated_at: time,
    snapshot: { anchor_link: null, attachments: [], content: 'Original body', created_at: 'created',
      deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'node',
      image_regions: null, is_title_manual: false, kind: 'folder', opening_text: 'Base opening',
      parent_id: null, priority: 1, reveal: null, title: 'Base title', updated_at: time,
      virtual_filter: null, manual_child_order: '["a","b"]' } };
}

function metadata(value: NativeSyncNodeRecord) {
  const snapshot = { ...value.snapshot };
  delete snapshot.content;
  const description: NodeSnapshotMetadata = snapshot;
  return { version_id: value.version_id, version_created_at: value.version_created_at,
    updated_at: value.updated_at, snapshot: description, bodyReference: value.version_id };
}

it('returns the original metadata winner using the same time and version ordering', () => {
  const older = metadata(record('a', '2026-01-01'));
  const newer = metadata(record('b', '2026-01-02'));
  expect(laterNodeRecord(older, newer)).toBe(newer);
  const tie = { ...older, version_id: 'z' };
  expect(laterNodeRecord(older, tie)).toBe(tie);
  expect(laterNodeRecord(older, older)).toBe(older);
  const fallback = { ...newer, version_created_at: null };
  expect(laterNodeRecord(older, fallback)).toBe(fallback);
});

it.each([false, true])('merges metadata fields exactly like complete records with folder members %s', (folder) => {
  const base = record('base', '2026-01-01');
  const left = record('left', '2026-01-02');
  left.snapshot = { ...left.snapshot, title: 'Left title', opening_text: 'Left opening',
    deleted_at: 'left deletion', manual_child_order: '["a","c"]' };
  const right = record('right', '2026-01-03');
  right.snapshot = { ...right.snapshot, priority: 2, opening_text: 'Right opening',
    manual_child_order: '["a","b","d"]' };
  const leftMetadata = metadata(left);
  const rightMetadata = metadata(right);
  const actual = mergeNodeSnapshot(metadata(base).snapshot, leftMetadata, rightMetadata, folder);
  const complete = mergeNodeSnapshot(base.snapshot, left, right, folder);
  const expected = { ...complete.snapshot };
  delete expected.content;
  expect(actual.snapshot).toEqual(expected);
  expect(actual.snapshot).not.toHaveProperty('content');
  expect(actual.snapshot).toMatchObject({ title: 'Left title', priority: 2,
    opening_text: 'Right opening', deleted_at: null });
  expect(actual.snapshot.manual_child_order).toBe(folder ? '["a","d","c"]' : '["a","b","d"]');
  expect(actual.winner).toBe(rightMetadata);
  expect(actual.winner.bodyReference).toBe('right');
  expect(complete.winner).toBe(right);
  expect(complete.snapshot.content).toBe('Original body');
});

it('preserves the selected snapshot without a common base and returns its input identity', () => {
  const left = metadata(record('left', '2026-01-03'));
  const right = metadata(record('right', '2026-01-02'));
  const result = mergeNodeSnapshot(null, left, right, false);
  expect(result.snapshot).toEqual(left.snapshot);
  expect(result.winner).toBe(left);
});
