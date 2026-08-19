import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../../lib/core/database/androidCompanionSyncProtocolDefinitions';
import { computeSyncContentHash } from '../../../lib/core/database/syncState';

import {
  nodeReadingSyncAdapter,
  nodeReviewSyncAdapter,
  settingSyncAdapter,
  viewStateSyncAdapter,
  type SyncableStateObjectRow
} from './companionSyncPushProtocol';

function createSettingRow(overrides: Partial<SyncableStateObjectRow> = {}): SyncableStateObjectRow {
  return {
    base_content_hash: 'desktop-setting-base',
    content_hash: 'android-setting-next',
    deleted_at: null,
    last_modified_by_host_name: 'android-device',
    object_id: 'device',
    object_type: 'setting',
    payload_json: '{}',
    state_seq: 14,
    updated_at: '2026-04-30T01:06:00.000Z',
    ...overrides
  };
}

function createViewStateRow(overrides: Partial<SyncableStateObjectRow> = {}): SyncableStateObjectRow {
  return {
    base_content_hash: 'desktop-view-base',
    content_hash: 'android-view-next',
    deleted_at: null,
    last_modified_by_host_name: 'android-device',
    object_id: 'session_resume:android:phone',
    object_type: 'view_state',
    payload_json: '{}',
    state_seq: 15,
    updated_at: '2026-04-30T01:07:00.000Z',
    ...overrides
  };
}

function createNodeReadingRow(overrides: Partial<SyncableStateObjectRow> = {}): SyncableStateObjectRow {
  return {
    base_content_hash: 'desktop-reading-base',
    content_hash: 'android-reading-next',
    deleted_at: null,
    last_modified_by_host_name: 'android-device',
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: '{"reading_position":42,"state":"active"}',
    state_seq: 16,
    updated_at: '2026-04-30T01:08:00.000Z',
    ...overrides
  };
}

function createNodeReviewRow(overrides: Partial<SyncableStateObjectRow> = {}): SyncableStateObjectRow {
  return {
    base_content_hash: 'desktop-review-base',
    content_hash: 'android-review-next',
    deleted_at: null,
    last_modified_by_host_name: 'android-device',
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: '{"reps":2}',
    state_seq: 17,
    updated_at: '2026-04-30T01:09:00.000Z',
    ...overrides
  };
}

describe('companion sync push identity validation', () => {
  it('loads scoped state object identity rules from generated protocol definitions', () => {
    expect(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncStateObjectIdentity).toEqual({
      defaultScope: 'workspace',
      scopedObjectIdDelimiter: ':',
      scopedObjectIdPartLimit: 5,
      scopedObjectTypes: ['setting', 'view_state'],
      scopePartIndex: 0
    });
  });

  it('builds state object push payloads with generated identity and base semantics', () => {
    const settingRow = createSettingRow({ object_id: 'device:android:phone:device-1:app_settings' });
    const viewStateRow = createViewStateRow({ object_id: 'session_resume:android:phone:device-1:active_node' });
    const readingRow = createNodeReadingRow();
    const reviewRow = createNodeReviewRow();

    expect(settingSyncAdapter.buildPushPayload(settingRow)).toMatchObject({
      base: { baseContentHash: 'desktop-setting-base', kind: 'content_hash' },
      identity: { objectId: settingRow.object_id, objectType: 'setting', scope: 'device' },
      payloadJson: '{}'
    });
    expect(viewStateSyncAdapter.buildPushPayload(viewStateRow)).toMatchObject({
      base: { baseContentHash: 'desktop-view-base', kind: 'content_hash' },
      identity: { objectId: viewStateRow.object_id, objectType: 'view_state', scope: 'session_resume' },
      payloadJson: '{}'
    });
    expect(nodeReadingSyncAdapter.buildPushPayload(readingRow)).toMatchObject({
      identity: { objectId: 'node-1', objectType: 'node_reading', scope: 'workspace' },
      payloadJson: '{"reading_position":42,"state":"active"}'
    });
    expect(nodeReviewSyncAdapter.buildPushPayload(reviewRow)).toMatchObject({
      identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
      payloadJson: '{"reps":2}'
    });
  });

  it('blocks malformed setting dirty rows before push', () => {
    expect(settingSyncAdapter.baseReference(createSettingRow())).toEqual({
      kind: 'blocked',
      reason: 'invalid_identity'
    });
  });

  it('blocks malformed view_state dirty rows before push', () => {
    expect(viewStateSyncAdapter.baseReference(createViewStateRow())).toEqual({
      kind: 'blocked',
      reason: 'invalid_identity'
    });
  });
});

describe('companion sync state content hash fixtures', () => {
  it('keeps TS setting hash aligned with Android stable JSON semantics', () => {
    expect(computeSyncContentHash('setting', {
      device_id: '*',
      form_factor: 'phone',
      key: 'app_settings',
      platform: 'android',
      scope: 'device',
      value_json: '{}'
    })).toBe('9e69e630599265a21fa79717893df188b92389e90cf81cf18a6fac047cede788');
  });

  it('keeps TS view-state hash aligned with Android stable JSON semantics', () => {
    expect(computeSyncContentHash('view_state', {
      active_node_id: 'node-1',
      device_id: 'device-1',
      form_factor: 'phone',
      key: 'active_node',
      platform: 'android',
      scope: 'session_resume'
    })).toBe('d3dc15e282a5142cc653d9c734d43ffb77c08ef3b7623a8b63873c59e5f3281b');
  });
});
