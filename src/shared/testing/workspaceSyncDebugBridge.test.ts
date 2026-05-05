import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord
} from '../../../lib/platform/nativeSyncContract';

const { getRuntimeInvoke } = vi.hoisted(() => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../platform/runtimeInvoke', () => ({
  getRuntimeInvoke
}));

import { createWorkspaceSyncDebugApi } from './workspaceSyncDebugBridge';

beforeEach(() => {
  vi.clearAllMocks();
  getRuntimeInvoke.mockReturnValue(null);
});

function buildRemoteNodeRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['remote-device#2'],
    content_hash: 'hash-1',
    device_id: 'remote-device',
    object_id: 'remote-node-1',
    object_type: 'node',
    parent_version_id: 'remote-device#2',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'Remote body',
      created_at: '2026-04-21T10:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'remote-node-1',
      image_regions: null,
      is_title_manual: true,
      kind: 'topic',
      opening_text: null,
      parent_id: null,
      position: 0,
      priority: null,
      reveal: null,
      title: 'Remote Node',
      updated_at: '2026-04-21T10:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T10:00:00.000Z',
    version_created_at: '2026-04-21T10:00:00.000Z',
    version_id: 'remote-device#3'
  };
}

it('runs a node sync pull session and reads sync conflict state through the debug api', async () => {
  const localIndex: NativeSyncIndexEntry[] = [];
  const remoteIndex: NativeSyncIndexEntry[] = [
    {
      content_hash: 'hash-1',
      object_id: 'remote-node-1',
      object_type: 'node',
      sync_version_id: 'remote-device#3',
      updated_at: '2026-04-21T10:00:00.000Z'
    }
  ];
  const remoteNodes = [buildRemoteNodeRecord()];
  const conflictRecords: NativeSyncNodeConflictRecord[] = [
    {
      conflict_version_id: 'remote-device#3',
      content_hash: 'hash-1',
      device_id: 'remote-device',
      object_id: 'remote-node-1',
      parent_version_id: 'remote-device#2',
      snapshot: remoteNodes[0].snapshot,
      updated_at: '2026-04-21T10:00:00.000Z'
    }
  ];
  const runtimeInvoke: NativeInvoke = vi.fn(async (command: string, args?: unknown) => {
    if (command === 'load_sync_index') {
      return localIndex;
    }
    if (command === 'apply_sync_nodes') {
      return ['remote-node-1'];
    }
    if (command === 'record_sync_node_conflicts') {
      return ['remote-device#3'];
    }
    if (command === 'load_sync_node_conflicts') {
      expect(args).toEqual({ objectIds: ['remote-node-1'] });
      return conflictRecords;
    }
    return null;
  }) as NativeInvoke;
  getRuntimeInvoke.mockReturnValue(runtimeInvoke);
  const debugApi = createWorkspaceSyncDebugApi();

  const syncIndex = await debugApi.loadLocalSyncIndex();
  const result = await debugApi.runNodeSyncPullSession({ remoteIndex, remoteNodes });
  const conflicts = await debugApi.loadNodeSyncConflicts('remote-node-1');

  expect(syncIndex).toEqual(localIndex);
  expect(result?.requestedRemoteObjectIds).toEqual(['remote-node-1']);
  expect(result?.execution.appliedObjectIds).toEqual(['remote-node-1']);
  expect(runtimeInvoke).toHaveBeenCalledWith('apply_sync_nodes', { nodes: remoteNodes });
  expect(runtimeInvoke).toHaveBeenCalledWith('load_sync_node_conflicts', { objectIds: ['remote-node-1'] });
  expect(conflicts).toEqual(conflictRecords);
});
