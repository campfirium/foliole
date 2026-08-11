import { beforeEach, expect, it, vi } from 'vitest';

const httpMock = vi.hoisted(() => ({ post: vi.fn() }));
const storeMock = vi.hoisted(() => ({
  loadNodeVersions: vi.fn(async () => []),
  loadNodeVersionPushCursor: vi.fn(async () => null),
  loadReviewLog: vi.fn(async () => [{
    device_id: 'ios-device', difficulty_after: 3.2, difficulty_before: 3.1,
    due_after: '2026-07-22T00:00:00.000Z', due_before: '2026-07-20T00:00:00.000Z',
    grade: 3, id: 'log-1', node_id: 'node-1', op_id: 'op-1',
    reviewed_at: '2026-07-20T00:00:00.000Z', scheduler_version: 'ts-fsrs@4',
    stability_after: 4.1, stability_before: 2.1
  }]),
  loadReviewLogPushCursor: vi.fn(async () => null),
  loadStateChanges: vi.fn(async () => [{
    base_content_hash: 'reading-base', content_hash: 'reading-hash', deleted_at: null,
    object_id: 'node-1', object_type: 'node_reading', payload_json: '{"state":"active"}',
    state_seq: 4, updated_at: '2026-07-20T00:00:00.000Z'
  }, {
    base_content_hash: 'review-base', content_hash: 'review-hash', deleted_at: null,
    object_id: 'node-1', object_type: 'node_review', payload_json: '{"state":2}',
    state_seq: 5, updated_at: '2026-07-20T00:00:00.000Z'
  }, {
    base_content_hash: null, content_hash: 'setting-hash', deleted_at: null,
    object_id: 'device:ios:phone:*:handoff_reminder_settings', object_type: 'setting',
    payload_json: '{"scope":"device","platform":"ios","form_factor":"phone","device_id":"*","key":"handoff_reminder_settings","value_json":"{\\"enabled\\":true}"}',
    state_seq: 6, updated_at: '2026-07-20T00:00:00.000Z'
  }]),
  loadStatePushCursor: vi.fn(async () => null),
  savePushAcks: vi.fn(async () => [
    'node_reading:node-1:4', 'node_review:node-1:5',
    'setting:device:ios:phone:*:handoff_reminder_settings:6'
  ]),
  stagePushItems: vi.fn(async () => undefined),
  saveNodeVersionPushCursor: vi.fn(async () => null)
}));
const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'ios'),
  isNativePlatform: vi.fn(() => true)
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorMock,
  registerPlugin: vi.fn(() => ({}))
}));
vi.mock('./companion/sync/syncback/iosCompanionSyncbackStore', () => ({
  getIosCompanionSyncbackStore: vi.fn(() => storeMock)
}));
vi.mock('./companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: vi.fn(async () => null)
}));
vi.mock('./companionWorkspacePairing', () => ({
  loadCompanionPairingState: vi.fn(async () => ({ remote_peer_id: 'desktop-peer' }))
}));
vi.mock('./companionDesktopSyncHttp', () => ({ postDesktopJson: httpMock.post }));
vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: vi.fn((task: () => Promise<unknown>) => task())
}));

beforeEach(() => {
  vi.clearAllMocks();
  httpMock.post.mockResolvedValue({
    acks: [
      {
        client_op_id: 'node_reading:node-1:4',
        identity: { objectId: 'node-1', objectType: 'node_reading', scope: 'workspace' },
        state_seq: 4,
        status: 'accepted'
      },
      {
        client_op_id: 'node_review:node-1:5',
        identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
        state_seq: 5,
        status: 'accepted'
      },
      {
        client_op_id: 'setting:device:ios:phone:*:handoff_reminder_settings:6',
        identity: {
          objectId: 'device:ios:phone:*:handoff_reminder_settings',
          objectType: 'setting',
          scope: 'device'
        },
        state_seq: 6,
        status: 'accepted'
      },
      {
        client_op_id: 'review_log:op-1',
        identity: { objectId: 'op-1', objectType: 'review_log', scope: 'workspace' },
        status: 'accepted'
      }
    ]
  });
});

it('pushes iOS state through the macOS shared protocol', async () => {
  const { pushLocalDirtyObjects } = await import('./companionDesktopSyncPush');

  await expect(pushLocalDirtyObjects('http://desktop.local')).resolves.toEqual({
    pushConflictCount: 0,
    pushedObjectIds: [
      'node_reading:node-1',
      'node_review:node-1',
      'setting:device:ios:phone:*:handoff_reminder_settings'
    ],
    pushedReviewOpIds: ['op-1'],
    pushError: null,
    pushRejectedCount: 0
  });
  expect(httpMock.post).toHaveBeenCalledWith(
    'http://desktop.local',
    '/companion/sync-push',
    { items: [
      expect.objectContaining({
        clientOpId: 'node_reading:node-1:4',
        identity: { objectId: 'node-1', objectType: 'node_reading', scope: 'workspace' }
      }),
      expect.objectContaining({
        clientOpId: 'node_review:node-1:5',
        identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' }
      }),
      expect.objectContaining({
        clientOpId: 'setting:device:ios:phone:*:handoff_reminder_settings:6',
        identity: {
          objectId: 'device:ios:phone:*:handoff_reminder_settings',
          objectType: 'setting',
          scope: 'device'
        }
      }),
      expect.objectContaining({
        clientOpId: 'review_log:op-1',
        identity: { objectId: 'op-1', objectType: 'review_log', scope: 'workspace' }
      })
    ] }
  );
  expect(storeMock.savePushAcks).toHaveBeenCalledTimes(1);
});
