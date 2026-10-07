import { expect, it } from 'vitest';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import {
  decideIncomingNodeApply, latestBranchHeadRecords, orderNodesForApply,
  type LocalSyncNodeState, type SyncNodeApplyMetadata, type SyncNodeApplyOperation
} from './syncNodeApplyRules.js';

const local: LocalSyncNodeState = {
  current_version_id: 'desktop#deleted',
  deleted_at: '2026-07-21T00:00:00.000Z',
  sync_dirty: 1
};

function restoredVersion(parentVersionId: string | null): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'restored-hash',
    host_name: 'ios-device',
    object_id: 'topic-trash',
    object_type: 'node',
    parent_version_id: parentVersionId,
    snapshot: {
      anchor_link: null,
      attachments: [],
      created_at: '2026-07-20T00:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'topic-trash',
      image_regions: null,
      is_title_manual: false,
      kind: 'topic',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: 'Restored topic',
      updated_at: '2026-07-21T01:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-07-21T01:00:00.000Z',
    version_created_at: '2026-07-21T01:00:00.000Z',
    version_id: 'ios-device#restored'
  };
}

it('accepts local and remote restores that descend from the deleted version', () => {
  expect(decideIncomingNodeApply(local, restoredVersion('desktop#deleted'), 'local_restore'))
    .toBe('apply_fast_forward');
  expect(decideIncomingNodeApply(local, restoredVersion('desktop#deleted')))
    .toBe('apply_fast_forward');
  expect(decideIncomingNodeApply(local, {
    ...restoredVersion('ios-device#intermediate'),
    ancestor_version_ids: ['ios-device#intermediate', 'desktop#deleted']
  })).toBe('apply_fast_forward');
  expect(decideIncomingNodeApply(local, restoredVersion('desktop#stale'), 'local_restore'))
    .toBe('block_incoming');
});

it('advances a dirty active node only for an explicit local mutation', () => {
  const active = { ...local, deleted_at: null };
  const mutation = {
    ...restoredVersion('desktop#deleted'),
    snapshot: { ...restoredVersion('desktop#deleted').snapshot, deleted_at: null }
  };

  expect(decideIncomingNodeApply(active, mutation, 'local_mutation')).toBe('apply_fast_forward');
  expect(decideIncomingNodeApply(active, mutation, 'remote_sync')).toBe('block_incoming');
});

it('makes the same apply decisions from metadata without body or snapshot content', () => {
  const operations: SyncNodeApplyOperation[] = ['remote_sync', 'local_restore', 'local_mutation'];
  const states = [null, local, { ...local, deleted_at: null }, { ...local, deleted_at: null, sync_dirty: 0 }];
  const records = [restoredVersion('desktop#deleted'), restoredVersion('desktop#stale'),
    { ...restoredVersion(null), version_id: 'desktop#deleted' },
    { ...restoredVersion(null), ancestor_version_ids: ['desktop#deleted'] },
    { ...restoredVersion(null), snapshot: { ...restoredVersion(null).snapshot, deleted_at: local.deleted_at } }];
  for (const record of records) {
    const metadata: SyncNodeApplyMetadata = {
      version_id: record.version_id, parent_version_id: record.parent_version_id,
      ancestor_version_ids: record.ancestor_version_ids,
      snapshot: { deleted_at: record.snapshot.deleted_at }
    };
    for (const state of states) for (const operation of operations) {
      expect(decideIncomingNodeApply(state, metadata, operation)).toBe(decideIncomingNodeApply(state, record, operation));
    }
  }
});

it('keeps branch selection and parent ordering while preserving metadata input values', () => {
  const root = { ...restoredVersion(null), object_id: 'root', version_id: 'root-version' };
  const child = { ...restoredVersion('root-version'), object_id: 'child', version_id: 'child-version',
    snapshot: { ...restoredVersion(null).snapshot, parent_id: 'root' } };
  const fork = { ...restoredVersion(null), object_id: 'fork', version_id: 'fork-version',
    parent_version_ids: ['root-version'] };
  const records = [child, fork, root];
  const metadata = records.map((record, ordinal) => ({
    object_id: record.object_id, version_id: record.version_id, parent_version_id: record.parent_version_id,
    ...(record.parent_version_ids === undefined ? {} : { parent_version_ids: record.parent_version_ids }),
    ancestor_version_ids: record.ancestor_version_ids,
    snapshot: { parent_id: record.snapshot.parent_id }, ordinal
  }));
  const heads = latestBranchHeadRecords(metadata);
  expect(heads.map((record) => record.version_id)).toEqual(['child-version', 'fork-version']);
  expect(heads.map((record) => record.ordinal)).toEqual([0, 1]);
  expect(heads.map((record) => record.version_id)).toEqual(latestBranchHeadRecords(records).map((record) => record.version_id));
  const ordered = orderNodesForApply(metadata);
  expect(ordered.map((record) => record.object_id)).toEqual(['root', 'child', 'fork']);
  expect(ordered.map((record) => record.ordinal)).toEqual([2, 0, 1]);
  expect(ordered.map((record) => record.object_id)).toEqual(orderNodesForApply(records).map((record) => record.object_id));
  expect(ordered[0]).toBe(metadata[2]);
});
