import type {
  NativeSyncNodeRecord,
  NativeSyncReviewLogRecord
} from '../../../lib/platform/nativeSyncContract';

export function createNodeRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'node-hash',
    host_name: 'desktop',
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
    host_name: 'desktop',

    grade: 3,
    id: 'review-1',
    node_id: 'node-1',
    op_id: 'op-1',
    reviewed_at: '2026-04-25T00:04:00.000Z',
    kind: 'review', voids_op_id: null, scheduler_version: 'test',

  };
}
