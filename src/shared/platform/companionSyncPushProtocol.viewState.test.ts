import { describe, expect, it } from 'vitest';

import {
  viewStateSyncAdapter,
  type SyncableStateObjectRow
} from './companionSyncPushProtocol';

function createViewStateRow(overrides: Partial<SyncableStateObjectRow> = {}): SyncableStateObjectRow {
  return {
    base_content_hash: 'desktop-view-base',
    content_hash: 'android-view-next',
    deleted_at: null,
    object_id: 'session_resume:android:phone:android-test:active_node',
    object_type: 'view_state',
    payload_json: '{"active_node_id":"node-1"}',
    state_seq: 15,
    updated_at: '2026-04-30T01:07:00.000Z',
    ...overrides
  };
}

describe('companion view_state sync push adapter', () => {
  it('builds a push payload scoped by its state scope', () => {
    const row = createViewStateRow();

    expect(viewStateSyncAdapter.buildPushPayload(row)).toMatchObject({
      base: { baseContentHash: 'desktop-view-base', kind: 'content_hash' },
      clientOpId: 'view_state:session_resume:android:phone:android-test:active_node:15',
      identity: {
        objectId: 'session_resume:android:phone:android-test:active_node',
        objectType: 'view_state',
        scope: 'session_resume'
      }
    });
  });

  it('applies pull payloads with LWW semantics even when local state is dirty', () => {
    const payload = createViewStateRow({ state_seq: 20 });
    const dirtyLocal = createViewStateRow({ local_status: 'dirty', state_seq: 15 });

    expect(viewStateSyncAdapter.applyPullPayload(payload, dirtyLocal)).toEqual({
      identity: {
        objectId: 'session_resume:android:phone:android-test:active_node',
        objectType: 'view_state',
        scope: 'session_resume'
      },
      status: 'applied'
    });
  });
});
