import { expect, it } from 'vitest';

import { compareSyncIdentityNodeFacts,
  type SyncIdentityNodeFactDescription } from './syncIdentityNodeFactComparison.js';

function version(id: string, parent: string | null = null) {
  return { version_id: id, object_id: 'topic', parent_version_id: parent,
    body_hash: `body-${id}`, content_hash: `content-${id}`, host_name: 'A',
    created_at: 'now', snapshot_metadata: '{}' };
}

function description(full: boolean): SyncIdentityNodeFactDescription {
  return { nodeId: 'topic', headId: 'restored',
    versions: [version('base'), version('other'), version('merged', full ? 'base' : null),
      version('restored', 'merged')],
    parents: [
      ...(full ? [
        { version_id: 'merged', parent_version_id: 'base', ordinal: 0 },
        { version_id: 'merged', parent_version_id: 'other', ordinal: 1 }
      ] : []),
      { version_id: 'restored', parent_version_id: 'merged', ordinal: 0 }
    ],
    requirements: [{ version_id: 'restored', frozen: 0 }], reviews: [] };
}

it('requests a missing original tombstone head from a peer that retains it', () => {
  const missing = { ...description(true), versions: [], parents: [] };
  expect(compareSyncIdentityNodeFacts(missing, description(true))).toEqual({
    leftNeedsRepair: true, rightNeedsRepair: false
  });
  expect(() => compareSyncIdentityNodeFacts(missing, missing)).toThrow('sync_identity_fact_projection_');
});

it('accepts different body retention with the same original graph and required head', () => {
  const left = description(true);
  left.versions = left.versions.map((row) => row.version_id === left.headId ? row :
    { ...row, body_hash: null });
  expect(compareSyncIdentityNodeFacts(left, description(true))).toEqual({
    leftNeedsRepair: false, rightNeedsRepair: false
  });
});

it('requires a missing second-parent relation when that branch is protected', () => {
  const left = description(false);
  left.requirements.push({ version_id: 'other', frozen: 0 });
  expect(compareSyncIdentityNodeFacts(left, description(true))).toEqual({
    leftNeedsRepair: true, rightNeedsRepair: false
  });
});

it('repairs a protected body and independent review operation', () => {
  const left = description(false);
  const right = description(true);
  left.requirements.push({ version_id: 'other', frozen: 0 });
  left.versions[1] = { ...left.versions[1]!, body_hash: null };
  right.reviews.push({ op_id: 'review-1', node_id: 'topic' });
  expect(compareSyncIdentityNodeFacts(left, right)).toEqual({
    leftNeedsRepair: true, rightNeedsRepair: false
  });
});

it('keeps review operations independent of the version graph', () => {
  const left = description(true);
  const right = description(true);
  right.reviews.push({ op_id: 'review-1', node_id: 'topic' });
  expect(compareSyncIdentityNodeFacts(left, right)).toEqual({
    leftNeedsRepair: true, rightNeedsRepair: false
  });
});

it('retains an unabsorbed leaf branch behind an unchanged current state', () => {
  const left = description(true);
  const right = description(true);
  right.versions.push(version('hidden', 'base'));
  right.parents.push({ version_id: 'hidden', parent_version_id: 'base', ordinal: 0 });
  expect(compareSyncIdentityNodeFacts(left, right)).toEqual({
    leftNeedsRepair: true, rightNeedsRepair: false
  });
});

it('detects a missing primary edge even when legacy parent metadata remains', () => {
  const left = description(true);
  left.parents = left.parents.filter((edge) => edge.version_id !== 'restored');
  expect(compareSyncIdentityNodeFacts(left, description(true))).toEqual({
    leftNeedsRepair: true, rightNeedsRepair: false
  });
});

it('rejects an immutable version identity collision', () => {
  const left = description(false);
  const right = description(true);
  right.versions[1] = { ...right.versions[1]!, content_hash: 'different' };
  expect(() => compareSyncIdentityNodeFacts(left, right))
    .toThrow('sync_pack_node_version_immutable_mismatch:other');
});
