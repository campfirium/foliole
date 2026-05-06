import { describe, expect, it, vi } from 'vitest';

import { runSyncPushSession } from '../../lib/core/sync/syncSessionService.js';
import type { NativeInvoke } from '../../lib/platform/nativeContract.js';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord
} from '../../lib/platform/nativeSyncContract.js';
import { createNativeSyncRuntimePort } from '../../lib/platform/nativeSyncRuntimePort.js';

function createIndexEntry(overrides: Partial<NativeSyncIndexEntry> & Pick<NativeSyncIndexEntry, 'object_id'>) {
  const { object_id, ...rest } = overrides;
  return {
    content_hash: null,
    object_id,
    object_type: 'node' as const,
    sync_version_id: null,
    updated_at: '2026-04-21T17:00:00.000Z',
    ...rest
  };
}

function createNodeRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'hash-local-node',
    device_id: 'desktop',
    object_id: 'local-node-1',
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
      id: 'local-node-1',
      image_regions: null,
      is_title_manual: false,
      kind: 'item',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: 'Local Node',
      updated_at: '2026-04-21T17:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T17:00:00.000Z',
    version_created_at: '2026-04-21T17:00:00.000Z',
    version_id: 'desktop#10'
  };
}

function createSettingObject(): NativeSyncObjectRecord {
  return {
    content_hash: 'hash-local-setting',
    deleted_at: null,
    object_id: 'user_space:windows:desktop:*:app_settings',
    object_type: 'setting',
    payload_json: '{"key":"app_settings"}',
    updated_at: '2026-04-21T19:00:00.000Z'
  };
}

function createLocalInvoke(localNode: NativeSyncNodeRecord, localObject: NativeSyncObjectRecord) {
  return vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'load_sync_index') {
      return [
        createIndexEntry({
          object_id: 'local-node-1',
          sync_version_id: 'desktop#10',
          content_hash: 'hash-local-node'
        }),
        createIndexEntry({
          object_id: 'user_space:windows:desktop:*:app_settings',
          object_type: 'setting',
          content_hash: 'hash-local-setting',
          updated_at: '2026-04-21T19:00:00.000Z'
        })
      ];
    }
    if (command === 'load_sync_nodes') {
      expect(args).toEqual({ objectIds: ['local-node-1'] });
      return [localNode];
    }
    if (command === 'load_sync_objects') {
      expect(args).toEqual({
        objectIds: ['user_space:windows:desktop:*:app_settings'],
        objectTypes: ['setting']
      });
      return [localObject];
    }
    throw new Error(`unexpected local command ${command}`);
  }) as NativeInvoke;
}

function createRemoteInvoke(localNode: NativeSyncNodeRecord, localObject: NativeSyncObjectRecord) {
  return vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'load_sync_index') return [];
    if (command === 'apply_sync_nodes') {
      expect(args).toEqual({ nodes: [localNode] });
      return ['local-node-1'];
    }
    if (command === 'apply_sync_objects') {
      expect(args).toEqual({ objects: [localObject] });
      return ['setting:user_space:windows:desktop:*:app_settings'];
    }
    throw new Error(`unexpected remote command ${command}`);
  }) as NativeInvoke;
}

describe('runSyncPushSession', () => {
  it('pushes local nodes and generic objects to the remote invoke target', async () => {
    const localNode = createNodeRecord();
    const localObject = createSettingObject();
    const result = await runSyncPushSession(
      createNativeSyncRuntimePort(createLocalInvoke(localNode, localObject)),
      createNativeSyncRuntimePort(createRemoteInvoke(localNode, localObject))
    );

    expect(result.requestedLocalObjectIds).toEqual(['local-node-1']);
    expect(result.requestedLocalNodes).toEqual([localNode]);
    expect(result.requestedLocalSyncObjects).toEqual([localObject]);
    expect(result.execution.appliedObjectIds).toEqual(['local-node-1']);
    expect(result.appliedLocalObjectIds).toEqual(['setting:user_space:windows:desktop:*:app_settings']);
  });
});
