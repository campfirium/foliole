import { describe, expect, it } from 'vitest';

import {
  decideSyncNodeFromRemote,
  planSyncNodesFromRemote
} from '../../lib/core/sync/syncNodePlan.js';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeRecord
} from '../../lib/platform/nativeStorageContract.js';

function createLocalIndexEntry(
  overrides: Partial<NativeSyncIndexEntry> & Pick<NativeSyncIndexEntry, 'object_id'>
): NativeSyncIndexEntry {
  const { object_id, ...rest } = overrides;
  return {
    content_hash: null,
    object_id,
    object_type: 'node',
    sync_version_id: null,
    updated_at: '2026-04-21T17:00:00.000Z',
    ...rest
  };
}

function createRemoteNodeRecord(
  overrides: Partial<NativeSyncNodeRecord> & Pick<NativeSyncNodeRecord, 'object_id'>
): NativeSyncNodeRecord {
  const { object_id, ...rest } = overrides;
  return {
    ancestor_version_ids: [],
    content_hash: null,
    host_name: null,
    object_id,
    object_type: 'node',
    parent_version_id: null,
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: '',
      created_at: '2026-04-21T16:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: object_id,
      image_regions: null,
      is_title_manual: false,
      kind: 'item',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: '',
      updated_at: '2026-04-21T17:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T17:00:00.000Z',
    version_created_at: null,
    version_id: null,
    ...rest
  };
}

function createPlanLocalEntries() {
  return [
    createLocalIndexEntry({
      object_id: 'node-1',
      content_hash: 'hash-1',
      sync_version_id: 'desktop#1'
    }),
    createLocalIndexEntry({
      object_id: 'node-2',
      content_hash: 'hash-2',
      sync_version_id: 'desktop#2'
    }),
    createLocalIndexEntry({
      object_id: 'node-3',
      content_hash: 'hash-3',
      sync_version_id: 'desktop#3'
    })
  ];
}

function createPlanRemoteNodes() {
  return [
    createRemoteNodeRecord({
      object_id: 'node-0',
      version_id: 'phone#0'
    }),
    createRemoteNodeRecord({
      object_id: 'node-1',
      parent_version_id: 'desktop#1',
      version_id: 'phone#1'
    }),
    createRemoteNodeRecord({
      object_id: 'node-2',
      content_hash: 'hash-2',
      version_id: 'phone#2'
    }),
    createRemoteNodeRecord({
      object_id: 'node-3',
      content_hash: 'hash-remote-3',
      version_id: 'phone#3'
    })
  ];
}

function expectPlannedBuckets(plan: ReturnType<typeof planSyncNodesFromRemote>) {
  expect(plan.acceptRemote.map((item) => [item.remote.object_id, item.decision])).toEqual([
    ['node-0', 'accept_remote_missing_local'],
    ['node-1', 'accept_remote_fast_forward']
  ]);
  expect(plan.equivalentContent.map((item) => item.remote.object_id)).toEqual(['node-2']);
  expect(plan.conflicts.map((item) => item.remote.object_id)).toEqual(['node-3']);
  expect(plan.alreadyInSync).toEqual([]);
}

describe('decideSyncNodeFromRemote missing and linear cases', () => {
  it('classifies missing local object as accept remote', () => {
    expect(decideSyncNodeFromRemote(null, createRemoteNodeRecord({ object_id: 'node-1' }))).toBe(
      'accept_remote_missing_local'
    );
  });

  it('classifies direct child version as fast forward', () => {
    expect(
      decideSyncNodeFromRemote(
        createLocalIndexEntry({ object_id: 'node-1', sync_version_id: 'desktop#3' }),
        createRemoteNodeRecord({
          object_id: 'node-1',
          parent_version_id: 'desktop#3',
          version_id: 'phone#9'
        })
      )
    ).toBe('accept_remote_fast_forward');
  });

  it('classifies deeper ancestry hit as descendant', () => {
    expect(
      decideSyncNodeFromRemote(
        createLocalIndexEntry({ object_id: 'node-1', sync_version_id: 'desktop#3' }),
        createRemoteNodeRecord({
          ancestor_version_ids: ['phone#8', 'desktop#3', 'desktop#2'],
          object_id: 'node-1',
          parent_version_id: 'phone#8',
          version_id: 'phone#9'
        })
      )
    ).toBe('accept_remote_descendant');
  });
});

describe('decideSyncNodeFromRemote equivalent and conflict cases', () => {
  it('classifies equal hash with different version as equivalent content', () => {
    expect(
      decideSyncNodeFromRemote(
        createLocalIndexEntry({
          object_id: 'node-1',
          content_hash: 'same-hash',
          sync_version_id: 'desktop#3'
        }),
        createRemoteNodeRecord({
          object_id: 'node-1',
          content_hash: 'same-hash',
          version_id: 'phone#9'
        })
      )
    ).toBe('equivalent_content');
  });

  it('classifies remaining mismatch as conflict', () => {
    expect(
      decideSyncNodeFromRemote(
        createLocalIndexEntry({
          object_id: 'node-1',
          content_hash: 'local-hash',
          sync_version_id: 'desktop#3'
        }),
        createRemoteNodeRecord({
          object_id: 'node-1',
          content_hash: 'remote-hash',
          parent_version_id: 'desktop#1',
          version_id: 'phone#9'
        })
      )
    ).toBe('conflict');
  });
});

describe('planSyncNodesFromRemote', () => {
  it('groups remote node records into actionable buckets', () => {
    const plan = planSyncNodesFromRemote(createPlanLocalEntries(), createPlanRemoteNodes());
    expectPlannedBuckets(plan);
  });
});
