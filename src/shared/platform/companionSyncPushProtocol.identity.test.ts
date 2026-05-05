import { describe, expect, it } from 'vitest';

import {
  settingSyncAdapter,
  viewStateSyncAdapter,
  type SyncableStateObjectRow
} from './companionSyncPushProtocol';

function createSettingRow(overrides: Partial<SyncableStateObjectRow> = {}): SyncableStateObjectRow {
  return {
    base_content_hash: 'desktop-setting-base',
    content_hash: 'android-setting-next',
    deleted_at: null,
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
    object_id: 'session_resume:android:phone',
    object_type: 'view_state',
    payload_json: '{}',
    state_seq: 15,
    updated_at: '2026-04-30T01:07:00.000Z',
    ...overrides
  };
}

describe('companion sync push identity validation', () => {
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
