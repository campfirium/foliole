import { describe, expect, it, vi } from 'vitest';

import {
  collectConflictObjectIds,
  executeSyncNodePullPlan,
  planAndExecuteSyncNodesFromRemote
} from '../../lib/core/sync/syncPullExecutor.js';
import type { NativeInvoke } from '../../lib/platform/nativeContract.js';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeRecord
} from '../../lib/platform/nativeSyncContract.js';

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
    device_id: 'phone',
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
    version_created_at: '2026-04-21T17:00:00.000Z',
    version_id: null,
    ...rest
  };
}

function createApplyAndConflictInvoke() {
  return vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'apply_sync_nodes') {
      expect(args).toEqual({
        nodes: [
          expect.objectContaining({ object_id: 'node-1' })
        ]
      });
      return ['node-1'];
    }
    if (command === 'record_sync_node_conflicts') {
      return [];
    }
    throw new Error(`unexpected command ${command}`);
  }) as NativeInvoke;
}

function createEquivalentOnlyInvoke() {
  return vi.fn(async (command: string) => {
    expect(command).toBe('apply_sync_nodes');
    return ['node-1'];
  }) as NativeInvoke;
}

function createPlanExecutionInvoke() {
  return vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'apply_sync_nodes') {
      const nodes = (args?.nodes as Array<{ object_id: string }>);
      return nodes.map((node) => node.object_id);
    }
    if (command === 'record_sync_node_conflicts') {
      expect(args).toEqual({
        conflicts: [
          expect.objectContaining({
            conflict_version_id: 'phone#5',
            object_id: 'node-4'
          })
        ]
      });
      return ['phone#5'];
    }
    throw new Error(`unexpected command ${command}`);
  }) as NativeInvoke;
}

describe('executeSyncNodePullPlan', () => {
  it('applies accepted remote nodes and returns execution summary', async () => {
    const invoke = createApplyAndConflictInvoke();

    const result = await executeSyncNodePullPlan(invoke, {
      acceptRemote: [
        {
          decision: 'accept_remote_fast_forward',
          local: createLocalIndexEntry({ object_id: 'node-1', sync_version_id: 'desktop#1' }),
          remote: createRemoteNodeRecord({
            object_id: 'node-1',
            parent_version_id: 'desktop#1',
            version_id: 'phone#2'
          })
        }
      ],
      alreadyInSync: [],
      conflicts: [],
      equivalentContent: []
    });

    expect(result.appliedObjectIds).toEqual(['node-1']);
    expect(result.alignedEquivalentObjectIds).toEqual([]);
  });

  it('aligns equivalent-content nodes through native apply', async () => {
    const invoke = createEquivalentOnlyInvoke();

    const result = await executeSyncNodePullPlan(invoke, {
      acceptRemote: [],
      alreadyInSync: [],
      conflicts: [],
      equivalentContent: [
        {
          decision: 'equivalent_content',
          local: createLocalIndexEntry({
            object_id: 'node-1',
            content_hash: 'same-hash',
            sync_version_id: 'desktop#1'
          }),
          remote: createRemoteNodeRecord({
            object_id: 'node-1',
            content_hash: 'same-hash',
            version_id: 'phone#2'
          })
        }
      ]
    });

    expect(result.appliedObjectIds).toEqual([]);
    expect(result.alignedEquivalentObjectIds).toEqual(['node-1']);
    expect(result.recordedConflictVersionIds).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe('planAndExecuteSyncNodesFromRemote', () => {
  it('plans and applies only accepted remote nodes', async () => {
    const invoke = createPlanExecutionInvoke();

    const result = await planAndExecuteSyncNodesFromRemote(
      invoke,
      [
        createLocalIndexEntry({
          object_id: 'node-1',
          sync_version_id: 'desktop#1',
          content_hash: 'hash-1'
        }),
        createLocalIndexEntry({
          object_id: 'node-2',
          sync_version_id: 'desktop#2',
          content_hash: 'hash-2'
        }),
        createLocalIndexEntry({
          object_id: 'node-4',
          sync_version_id: 'desktop#4',
          content_hash: 'hash-4-local'
        })
      ],
      [
        createRemoteNodeRecord({
          object_id: 'node-1',
          parent_version_id: 'desktop#1',
          version_id: 'phone#2',
          content_hash: 'hash-1b'
        }),
        createRemoteNodeRecord({
          object_id: 'node-2',
          content_hash: 'hash-2',
          version_id: 'phone#3'
        }),
        createRemoteNodeRecord({
          object_id: 'node-3',
          parent_version_id: 'desktop#0',
          version_id: 'phone#4',
          content_hash: 'hash-remote-3'
        }),
        createRemoteNodeRecord({
          object_id: 'node-4',
          parent_version_id: 'desktop#0',
          version_id: 'phone#5',
          content_hash: 'hash-remote-4'
        })
      ]
    );

    expect(result.appliedObjectIds).toEqual(['node-1', 'node-3']);
    expect(result.alignedEquivalentObjectIds).toEqual(['node-2']);
    expect(result.recordedConflictVersionIds).toEqual(['phone#5']);
    expect(result.acceptRemote.map((item) => item.remote.object_id)).toEqual(['node-1', 'node-3']);
    expect(result.equivalentContent.map((item) => item.remote.object_id)).toEqual(['node-2']);
    expect(collectConflictObjectIds(result.conflicts)).toEqual(['node-4']);
  });
});
