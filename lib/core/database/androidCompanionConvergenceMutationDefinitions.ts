export const ANDROID_COMPANION_CONVERGENCE_MUTATION_DEFINITIONS = {
  nodeTextAlternativeUpdateStatus:
    "UPDATE node_text_alternatives SET status = ?, updated_at = ? WHERE alternative_id = ? AND status = 'available'",
  nodeRekeyCopy:
    'INSERT OR IGNORE INTO nodes (' +
    'id, parent_id, kind, priority, desired_retention, enable_short_term, sequential_reading_enabled, shelved_at, ' +
    'manual_child_order, title, is_title_manual, hide_title_heading, content, body_blob_hash, opening_text, virtual_filter, ' +
    'reveal, anchor_link, anchor_resolution_status, anchor_source_version_id, image_regions, import_source_fingerprint, ' +
    'import_content_fingerprint, position, current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at, deleted_at' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  nodeRekeyChildren: 'UPDATE nodes SET parent_id = ? WHERE parent_id = ?',
  nodeRekeyReview: 'UPDATE node_review SET node_id = ? WHERE node_id = ?',
  nodeRekeyReading: 'UPDATE node_reading SET node_id = ? WHERE node_id = ?',
  nodeRekeyOpenState: 'UPDATE node_open_state SET node_id = ? WHERE node_id = ?',
  nodeRekeyReadingHostState: 'UPDATE node_reading_host_state SET node_id = ? WHERE node_id = ?',
  nodeRekeyReviewLog: 'UPDATE review_log SET node_id = ? WHERE node_id = ?',
  nodeRekeyVersion:
    'UPDATE node_sync_versions SET object_id = ?, snapshot_json = ? WHERE version_id = ?',
  nodeRekeyTombstones: 'UPDATE node_sync_tombstones SET node_id = ? WHERE node_id = ?',
  nodeRekeyConflicts: 'UPDATE node_sync_conflicts SET object_id = ? WHERE object_id = ?',
  nodeRekeyAlternatives: 'UPDATE node_text_alternatives SET node_id = ? WHERE node_id = ?',
  nodeRekeyOrder: 'UPDATE node_order SET node_id = ? WHERE node_id = ?',
  nodeRekeyViewState: 'UPDATE node_view_state SET node_id = ? WHERE node_id = ?',
  nodeRekeyAttachments: 'UPDATE node_attachments SET node_id = ? WHERE node_id = ?',
  nodeRekeySyncState:
    "UPDATE sync_object_state SET object_id = ? WHERE object_id = ? AND object_type IN " +
    "('node', 'node_open_state', 'node_reading', 'node_review')",
  nodeRekeyPushAck: "UPDATE sync_delivery_receipts SET object_id = ? WHERE object_id = ? AND object_type = 'node'",
  nodeRekeyDeleteSource: 'DELETE FROM nodes WHERE id = ?'
};
