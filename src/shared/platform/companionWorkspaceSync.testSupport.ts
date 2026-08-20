import { vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../lib/platform/syncProtocolContract';

export function createStoredSyncState(): NativeCompanionWorkspaceSyncState {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-22T12:00:00.000Z',
    remembered_targets: ['http://10.0.2.2:38641', 'http://192.168.1.8:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed',
    workspace_snapshot: {
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': {
          content: 'Readable from local snapshot',
          createdAt: '2026-04-22T11:00:00.000Z',
          id: 'node-1',
          isTitleManual: false,
          hideTitleHeading: false,
          kind: 'item',
          parentNodeId: null,
          reading: null,
          reveal: null,
          review: null,
          title: 'Synced article',
          updatedAt: '2026-04-22T11:30:00.000Z',
          anchorLink: null
        },
        'node-2': {
          content: 'Fallback',
          createdAt: '2026-04-22T10:00:00.000Z',
          id: 'node-2',
          isTitleManual: false,
          hideTitleHeading: false,
          kind: 'item',
          parentNodeId: null,
          reading: null,
          reveal: null,
          review: null,
          title: 'Fallback article',
          updatedAt: '2026-04-22T10:30:00.000Z',
          anchorLink: null
        }
      },
      trashedNodeIds: [],
      untitledSequenceByParent: {}
    }
  };
}

export function createUpdatedStoredSnapshot() {
  const storedState = createStoredSyncState();
  const baseSnapshot = storedState.workspace_snapshot;
  if (!baseSnapshot) {
    throw new Error('Expected stored snapshot to exist.');
  }
  return {
    endpointUrl: storedState.endpoint_url,
    lastSyncedAt: storedState.last_synced_at,
    rememberedTargets: storedState.remembered_targets,
    workspaceSnapshot: {
      ...baseSnapshot,
      nodesById: {
        ...baseSnapshot.nodesById,
        'node-1': {
          ...baseSnapshot.nodesById['node-1']!,
          review: {
            difficulty: 4.1,
            due: '2026-04-25T12:00:00.000Z',
            elapsedDays: 0,
            lapses: 0,
            lastReviewAt: '2026-04-22T12:30:00.000Z',
            reps: 2,
            scheduledDays: 3,
            stability: 3.2,
            state: 2 as const
          },
          updatedAt: '2026-04-22T12:30:00.000Z'
        }
      }
    }
  };
}

export function mockFetchJson(payload: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status })));
}

export function storeWebPairingState() {
  window.localStorage.setItem(
    'foliole-companion-pairing-state',
    JSON.stringify({
      authorization_id: 'web-preview-authorization',
      credential_secret: 'test-secret',
      device_id: 'web-preview-device',
      device_kind: 'web-preview',
      device_name: 'Preview',
      device_secret: 'test-secret',
      host_name: 'Preview',
      host_platform: 'web-preview',
      is_paired: true,
      negotiated_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
      paired_at: '2026-04-22T12:00:00.000Z',
      remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    })
  );
}

export function resetCompanionWorkspaceSyncTestState(capacitorMock: {
  getPlatform: ReturnType<typeof vi.fn>;
  isNativePlatform: ReturnType<typeof vi.fn>;
}) {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  capacitorMock.getPlatform.mockReturnValue('web');
  capacitorMock.isNativePlatform.mockReturnValue(false);
}
