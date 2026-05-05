import { describe, expect, it } from 'vitest';

import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import {
  nodeVersionSyncAdapter,
  type SyncPushAck
} from './companionSyncPushProtocol';

function createNodeVersion(overrides: Partial<NativeSyncNodeRecord> = {}): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#1'],
    content_hash: 'android-node-hash',
    device_id: 'android-device',
    object_id: 'node-child',
    object_type: 'node',
    parent_version_id: 'desktop#1',
    snapshot: {
      anchor_link: '{"id":"anchor-1","kind":"highlight"}',
      attachments: [],
      content: 'Selected text',
      created_at: '2026-05-03T01:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'node-child',
      image_regions: null,
      is_title_manual: false,
      kind: 'topic',
      opening_text: null,
      parent_id: 'node-parent',
      position: null,
      priority: null,
      reveal: null,
      title: 'Selected text',
      updated_at: '2026-05-03T01:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-03T01:00:00.000Z',
    version_created_at: '2026-05-03T01:00:00.000Z',
    version_id: 'android#1',
    ...overrides
  };
}

describe('companion sync push node version adapter', () => {
  it('builds node version push payloads keyed by version id', () => {
    const row = createNodeVersion();

    expect(nodeVersionSyncAdapter.buildPushPayload(row)).toMatchObject({
      base: { ancestorVersionIds: ['desktop#1'], kind: 'node_version', parentVersionId: 'desktop#1' },
      clientOpId: 'node:android#1',
      contentHash: 'android-node-hash',
      identity: { objectId: 'node-child', objectType: 'node', scope: 'workspace' },
      updatedAt: '2026-05-03T01:00:00.000Z'
    });
  });

  it('confirms node versions only by matching accepted version id', () => {
    const row = createNodeVersion();
    const ack: SyncPushAck = {
      clientOpId: 'node:android#1',
      identity: nodeVersionSyncAdapter.identity(row),
      status: 'accepted',
      versionId: 'android#1'
    };

    expect(nodeVersionSyncAdapter.isConfirmedBy(row, ack)).toBe(true);
    expect(nodeVersionSyncAdapter.isConfirmedBy(row, { ...ack, versionId: 'android#2' })).toBe(false);
    expect(nodeVersionSyncAdapter.isConfirmedBy(row, { ...ack, status: 'conflict' })).toBe(false);
  });
});
