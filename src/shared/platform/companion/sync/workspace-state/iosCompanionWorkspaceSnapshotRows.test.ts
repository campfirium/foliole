import { describe, expect, it } from 'vitest';

import {
  attachIosWorkspaceNodeAttachments,
  buildIosPersistedNodeViews,
  buildIosWorkspaceNodes
} from './iosCompanionWorkspaceSnapshotRows';

function nodeRow() {
  return {
    anchor_link: null,
    body_blob_hash: null,
    body_status: 'ready',
    content: 'Body',
    created_at: '2026-07-19T00:00:00.000Z',
    current_version_id: 'version-1',
    deleted_at: null,
    desired_retention: null,
    enable_short_term: 1,
    hide_title_heading: 0,
    id: 'node-1',
    image_regions: null,
    import_content_fingerprint: null,
    import_source_fingerprint: null,
    interval_duration_ms: 86_400_000,
    interval_growth_factor: 2,
    is_title_manual: 1,
    kind: 'topic',
    last_handled_at: '2026-07-18T00:00:00.000Z',
    manual_child_order: null,
    next_at: '2026-07-20T00:00:00.000Z',
    opening_text: 'Opening',
    parent_id: null,
    position: 3,
    priority: 4,
    reading_position: 2,
    reading_priority: 1,
    reading_state: 'active',
    repetition_count: 5,
    reveal: null,
    sequential_reading_enabled: 0,
    shelved_at: null,
    title: 'Topic',
    updated_at: '2026-07-19T01:00:00.000Z',
    virtual_filter: null
  };
}

describe('iosCompanionWorkspaceSnapshotRows', () => {
  it('maps canonical SQLite rows through the shared workspace node builder', () => {
    const { nodesById } = buildIosWorkspaceNodes([nodeRow()]);

    expect(nodesById['node-1']).toMatchObject({
      content: 'Body',
      enableShortTerm: true,
      position: 3,
      reading: { intervalDurationMs: 86_400_000, readingPosition: 2, state: 'active' },
      title: 'Topic'
    });
  });

  it('attaches canonical attachment and view-state rows', () => {
    const { nodesById } = buildIosWorkspaceNodes([nodeRow()]);
    attachIosWorkspaceNodeAttachments(nodesById, [{
      attachment_id: 'attachment-1', mime_type: 'application/pdf', node_id: 'node-1', original_name: 'paper.pdf', role: 'reference'
    }]);
    const views = buildIosPersistedNodeViews([{
      node_id: 'node-1', scroll_top: 42, selection_from: 2, selection_to: 7, source: 'user-scroll', updated_at: '2026-07-19T02:00:00.000Z'
    }]);

    expect(nodesById['node-1']?.attachments).toEqual([expect.objectContaining({ attachmentId: 'attachment-1' })]);
    expect(views['node-1']).toMatchObject({ scrollTop: 42, selectionFrom: 2, selectionTo: 7 });
  });
});
