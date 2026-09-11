import { expect, it } from 'vitest';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { decideIncomingNodeApply, type LocalSyncNodeState } from './syncNodeApplyRules.js';

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
