import type {
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

export function createLocalNodeReadingChange(overrides: Partial<NativeSyncStateObjectRecord> = {}): NativeSyncStateObjectRecord {
  return {
    base_content_hash: 'desktop-reading-base',
    content_hash: 'local-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: '{"reading_position":42}',
    state_seq: 9,
    updated_at: '2026-04-25T00:04:00.000Z',
    ...overrides
  };
}

export function createLocalNodeReviewChange(): NativeSyncStateObjectRecord {
  return {
    base_content_hash: 'desktop-base',
    content_hash: 'local-review-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: '{"reps":2}',
    state_seq: 10,
    updated_at: '2026-04-25T00:05:00.000Z'
  };
}

export function createLocalSettingChange(): NativeSyncStateObjectRecord {
  return {
    base_content_hash: 'desktop-setting-base',
    content_hash: 'local-setting-hash',
    deleted_at: null,
    object_id: 'device:android:phone:*:app_settings',
    object_type: 'setting',
    payload_json: '{"key":"app_settings","scope":"device","platform":"android","form_factor":"phone","device_id":"*","value_json":"{}"}',
    state_seq: 11,
    updated_at: '2026-04-25T00:06:00.000Z'
  };
}

export function createLocalViewStateChange(): NativeSyncStateObjectRecord {
  return {
    base_content_hash: 'desktop-view-base',
    content_hash: 'local-view-hash',
    deleted_at: null,
    object_id: 'session_resume:android:phone:android-test-device:active_node',
    object_type: 'view_state',
    payload_json: '{"active_node_id":"node-1"}',
    state_seq: 12,
    updated_at: '2026-04-25T00:07:00.000Z'
  };
}

export function createLocalReviewLog(overrides: Partial<NativeSyncReviewLogRecord> = {}): NativeSyncReviewLogRecord {
  return {
    device_id: 'android-test-device',
    difficulty_after: 3,
    difficulty_before: 2,
    due_after: '2026-04-26T00:00:00.000Z',
    due_before: '2026-04-25T00:00:00.000Z',
    grade: 3,
    id: 'review-op-1',
    node_id: 'node-1',
    op_id: 'op-1',
    reviewed_at: '2026-04-25T00:05:00.000Z',
    scheduler_version: 'ts-fsrs@4',
    stability_after: 4,
    stability_before: 3,
    ...overrides
  };
}

export function parsePushItems(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body ?? '{}')) as {
    items: Array<{ clientOpId: string; identity: { objectId: string; objectType: string } }>;
  };
}
