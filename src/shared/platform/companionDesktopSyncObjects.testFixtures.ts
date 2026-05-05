import type {
  NativeSyncNodeRecord,
  NativeSyncReviewLogRecord
} from '../../../lib/platform/nativeSyncContract';

export function createNodeRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'node-hash',
    device_id: 'desktop',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: null,
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'Body',
      created_at: '2026-04-25T00:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: 'node-1',
      image_regions: null,
      is_title_manual: true,
      kind: 'item',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: 'Node 1',
      updated_at: '2026-04-25T00:03:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-25T00:03:00.000Z',
    version_created_at: '2026-04-25T00:03:00.000Z',
    version_id: 'version-1'
  };
}

export function createReviewRecord(): NativeSyncReviewLogRecord {
  return {
    device_id: 'desktop',
    difficulty_after: 3,
    difficulty_before: 2,
    due_after: '2026-04-26T00:00:00.000Z',
    due_before: '2026-04-25T00:00:00.000Z',
    grade: 3,
    id: 'review-1',
    node_id: 'node-1',
    op_id: 'op-1',
    reviewed_at: '2026-04-25T00:04:00.000Z',
    scheduler_version: 'test',
    stability_after: 4,
    stability_before: 1
  };
}
