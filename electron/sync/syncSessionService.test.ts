import { describe, expect, it, vi } from 'vitest';

import { runSyncPullSession } from '../../lib/core/sync/syncSessionService.js';
import type { NativeInvoke } from '../../lib/platform/nativeContract.js';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord
} from '../../lib/platform/nativeSyncContract.js';
import { createNativeSyncRuntimePort } from '../../lib/platform/nativeSyncRuntimePort.js';

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

function createSessionLocalInvoke() {
  return vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'load_sync_index') {
      return [
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
          object_id: 'node-5',
          sync_version_id: 'desktop#5',
          content_hash: 'hash-5'
        })
      ];
    }
    if (command === 'apply_sync_nodes') {
      const nodes = (args?.nodes as Array<{ object_id: string }>);
      return nodes.map((node) => node.object_id);
    }
    if (command === 'apply_sync_objects') {
      const objects = (args?.objects as Array<{ object_id: string; object_type: string }>);
      return objects.map((object) => `${object.object_type}:${object.object_id}`);
    }
    if (command === 'record_sync_node_conflicts') {
      return ['phone#8'];
    }
    throw new Error(`unexpected command ${command}`);
  }) as NativeInvoke;
}

function createSessionRemoteIndex() {
  return [
    createLocalIndexEntry({
      object_id: 'node-1',
      sync_version_id: 'phone#2',
      content_hash: 'hash-1b'
    }),
    createLocalIndexEntry({
      object_id: 'node-2',
      sync_version_id: 'phone#3',
      content_hash: 'hash-2'
    }),
    createLocalIndexEntry({
      object_id: 'node-3',
      sync_version_id: 'phone#4',
      content_hash: 'hash-3'
    }),
    createLocalIndexEntry({
      object_id: 'node-4',
      sync_version_id: 'phone#8',
      content_hash: 'hash-4'
    })
  ];
}

function createSessionRemoteNodes() {
  return [
    createRemoteNodeRecord({
      object_id: 'node-1',
      parent_version_id: 'desktop#1',
      version_id: 'phone#2',
      content_hash: 'hash-1b'
    }),
    createRemoteNodeRecord({
      object_id: 'node-2',
      version_id: 'phone#3',
      content_hash: 'hash-2'
    }),
    createRemoteNodeRecord({
      object_id: 'node-3',
      parent_version_id: 'desktop#0',
      version_id: 'phone#4',
      content_hash: 'hash-3'
    }),
    createRemoteNodeRecord({
      object_id: 'node-4',
      parent_version_id: 'desktop#0',
      version_id: 'phone#8',
      content_hash: 'hash-4'
    })
  ];
}

function createSessionRemoteObjects(): NativeSyncObjectRecord[] {
  return [{
    content_hash: 'hash-setting-2',
    deleted_at: null,
    object_id: 'user_space:windows:desktop:*:app_settings',
    object_type: 'setting',
    payload_json: '{"key":"app_settings"}',
    updated_at: '2026-04-21T18:00:00.000Z'
  }];
}

function createSessionRemoteSource() {
  return {
    loadSyncIndex: vi.fn(async () => [
      ...createSessionRemoteIndex(),
      createLocalIndexEntry({
        object_id: 'user_space:windows:desktop:*:app_settings',
        object_type: 'setting',
        content_hash: 'hash-setting-2',
        updated_at: '2026-04-21T18:00:00.000Z'
      })
    ]),
    loadSyncNodes: vi.fn(async (objectIds: string[]) => {
      expect(objectIds).toEqual(['node-1', 'node-2', 'node-3', 'node-4']);
      return createSessionRemoteNodes();
    }),
    loadSyncObjects: vi.fn(async (objectIds: string[], objectTypes?: string[]) => {
      expect(objectIds).toEqual(['user_space:windows:desktop:*:app_settings']);
      expect(objectTypes).toEqual(['setting']);
      return createSessionRemoteObjects();
    })
  };
}

function createInSyncLocalInvoke() {
  return vi.fn(async (command: string) => {
    if (command === 'load_sync_index') {
      return [
        createLocalIndexEntry({
          object_id: 'node-1',
          sync_version_id: 'desktop#1',
          content_hash: 'hash-1'
        })
      ];
    }
    throw new Error(`unexpected command ${command}`);
  }) as NativeInvoke;
}

function createInSyncRemoteSource() {
  return {
    loadSyncIndex: vi.fn(async () => [
      createLocalIndexEntry({
        object_id: 'node-1',
        sync_version_id: 'desktop#1',
        content_hash: 'hash-1'
      })
    ]),
    loadSyncNodes: vi.fn(),
    loadSyncObjects: vi.fn()
  };
}

describe('runSyncPullSession', () => {
  it('orchestrates index diff, remote node loading, and local execution', async () => {
    const localInvoke = createSessionLocalInvoke();
    const remoteSource = createSessionRemoteSource();

    const result = await runSyncPullSession(createNativeSyncRuntimePort(localInvoke), remoteSource);

    expect(result.pendingPushObjectIds).toEqual(['node-5']);
    expect(result.requestedRemoteObjectIds).toEqual(['node-1', 'node-2', 'node-3', 'node-4']);
    expect(result.execution.appliedObjectIds).toEqual(['node-1', 'node-3', 'node-4']);
    expect(result.execution.alignedEquivalentObjectIds).toEqual(['node-2']);
    expect(result.execution.recordedConflictVersionIds).toEqual([]);
    expect(result.requestedRemoteSyncObjects).toEqual(createSessionRemoteObjects());
    expect(result.appliedRemoteObjectIds).toEqual(['setting:user_space:windows:desktop:*:app_settings']);
  });

  it('skips remote node fetch and execution when indexes are already in sync', async () => {
    const localInvoke = createInSyncLocalInvoke();
    const remoteSource = createInSyncRemoteSource();

    const result = await runSyncPullSession(createNativeSyncRuntimePort(localInvoke), remoteSource);

    expect(result.requestedRemoteObjectIds).toEqual([]);
    expect(result.requestedRemoteNodes).toEqual([]);
    expect(result.execution.appliedObjectIds).toEqual([]);
    expect(result.execution.alignedEquivalentObjectIds).toEqual([]);
    expect(result.execution.recordedConflictVersionIds).toEqual([]);
    expect(remoteSource.loadSyncNodes).not.toHaveBeenCalled();
    expect(remoteSource.loadSyncObjects).not.toHaveBeenCalled();
  });
});
