-- Fresh Android companion library created by Foliole v0.8.2 (PRAGMA user_version = 117).
-- Generated from the v0.8.2 tag with its own bootstrap and sync group schema; triggers follow the seeded rows.
CREATE TABLE companion_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE node_reading_resume (
  node_id TEXT PRIMARY KEY NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES nodes(id),
    kind TEXT NOT NULL DEFAULT 'topic',
    priority INTEGER,
    desired_retention REAL,
    enable_short_term INTEGER,
    sequential_reading_enabled INTEGER,
    shelved_at TEXT,
    initial_review_due TEXT,
    manual_child_order TEXT,
    title TEXT NOT NULL,
    is_title_manual INTEGER NOT NULL DEFAULT 0,
    hide_title_heading INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    body_blob_hash TEXT,
    opening_text TEXT,
    virtual_filter TEXT,
    reveal TEXT,
    anchor_link TEXT,
    anchor_resolution_status TEXT,
    anchor_source_version_id TEXT,
    image_regions TEXT,
    image_sources TEXT,
    resource_references TEXT NOT NULL DEFAULT '[]',
    import_source_fingerprint TEXT,
    import_content_fingerprint TEXT,
    position INTEGER,
    current_version_id TEXT,
    last_modified_by_host_name TEXT,
    sync_dirty INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
CREATE TABLE node_review (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    due TEXT NOT NULL,
    last_review_at TEXT,
    state INTEGER NOT NULL DEFAULT 0,
    stability REAL NOT NULL DEFAULT 0,
    stability_fast REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    elapsed_days REAL NOT NULL DEFAULT 0,
    scheduled_days REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0
  );
CREATE TABLE node_reading (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    interval_duration_ms INTEGER NOT NULL DEFAULT 0,
    interval_growth_factor REAL NOT NULL DEFAULT 1,
    last_handled_at TEXT NOT NULL,
    next_at TEXT NOT NULL,
    priority REAL NOT NULL DEFAULT 0,
    repetition_count INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'active'
  );
CREATE TABLE node_open_state (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    last_opened_at TEXT NOT NULL
  );
CREATE TABLE node_reading_host_state (
    node_id TEXT NOT NULL REFERENCES nodes(id),
    host_name TEXT NOT NULL,
    reading_position INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (node_id, host_name)
  );
CREATE TABLE review_log (
    id TEXT PRIMARY KEY,
    op_id TEXT NOT NULL UNIQUE,
    host_name TEXT NOT NULL,
    node_id TEXT NOT NULL REFERENCES nodes(id),
    grade INTEGER NOT NULL,
    scheduler_version TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'review' CHECK(kind IN ('review', 'reset', 'void')),
    voids_op_id TEXT
  );
CREATE TABLE node_sync_versions (
    version_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    parent_version_id TEXT,
    host_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    body_text TEXT,
    snapshot_json TEXT
  );
CREATE TABLE node_sync_version_parents (
    version_id TEXT NOT NULL REFERENCES node_sync_versions(version_id) ON DELETE CASCADE,
    parent_version_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    PRIMARY KEY (version_id, parent_version_id),
    UNIQUE (version_id, ordinal)
  );
CREATE TABLE node_sync_tombstones (
    node_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    parent_version_id TEXT,
    host_name TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE node_sync_conflicts (
    conflict_version_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    parent_version_id TEXT,
    host_name TEXT,
    content_hash TEXT,
    snapshot_json TEXT NOT NULL,
    detected_at TEXT NOT NULL
  );
CREATE TABLE node_text_alternatives (
    alternative_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_version_id TEXT NOT NULL, body_text TEXT NOT NULL, source_host_name TEXT NOT NULL,
    created_at TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL,
    body_blob_hash TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL DEFAULT '',
    resource_references TEXT NOT NULL DEFAULT '[]', image_sources TEXT
  );
CREATE TABLE parent_child_order (
    parent_id TEXT PRIMARY KEY,
    child_ids_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE workspace_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE node_view_state (
    node_id TEXT NOT NULL REFERENCES nodes(id),
    host_name TEXT NOT NULL,
    scroll_top INTEGER NOT NULL DEFAULT 0,
    reading_offset INTEGER,
    selection_from INTEGER,
    selection_to INTEGER,
    source TEXT NOT NULL DEFAULT 'user-scroll',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (node_id, host_name)
  );
CREATE TABLE attachment_reference_cache (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    body_hash TEXT, resources_json TEXT NOT NULL, storage_keys_json TEXT NOT NULL
  );
CREATE TABLE daily_flow_state (
    id INTEGER PRIMARY KEY CHECK(id = 1), day_key TEXT NOT NULL, revision INTEGER NOT NULL,
    settings_key TEXT NOT NULL, mode TEXT NOT NULL, session_json TEXT NOT NULL,
    invalidated INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
  );
CREATE TABLE daily_flow_entries (
  node_id TEXT PRIMARY KEY, order_key INTEGER NOT NULL UNIQUE CHECK(order_key > 0),
  active INTEGER NOT NULL CHECK(active IN (0,1)), cohort TEXT NOT NULL CHECK(cohort IN ('queue','soon','none')),
  initial_task INTEGER NOT NULL CHECK(initial_task IN (0,1)), handled INTEGER NOT NULL CHECK(handled IN (0,1)));
CREATE TABLE daily_flow_operations (
    op_id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, revision INTEGER NOT NULL, card_json TEXT, source_session_json TEXT
  );
CREATE TABLE daily_flow_sync_facts (
    id TEXT PRIMARY KEY, root_id TEXT NOT NULL, occurred_at TEXT NOT NULL, day_start TEXT NOT NULL,
    payload_json TEXT NOT NULL, day_end TEXT NOT NULL DEFAULT '', parent_id TEXT, kind TEXT NOT NULL DEFAULT ''
  );
CREATE TABLE daily_flow_sync_projection (
    id INTEGER PRIMARY KEY CHECK(id = 1), root_id TEXT NOT NULL, head_id TEXT NOT NULL, merged INTEGER NOT NULL DEFAULT 0
  );
CREATE TABLE daily_flow_fact_rows (
    fact_id TEXT NOT NULL REFERENCES daily_flow_sync_facts(id) ON DELETE CASCADE,
    slot TEXT NOT NULL CHECK(slot IN ('rows','removedNodeIds','before','after')),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0), node_id TEXT NOT NULL,
    order_key INTEGER, active INTEGER, cohort TEXT, handled INTEGER, initial_task INTEGER,
    PRIMARY KEY (fact_id, slot, ordinal));
CREATE TABLE daily_flow_lists (
    list_id TEXT PRIMARY KEY REFERENCES daily_flow_sync_facts(id) ON DELETE CASCADE,
    row_count INTEGER NOT NULL CHECK(row_count >= 0), complete INTEGER NOT NULL CHECK(complete IN (0,1)));
CREATE TABLE daily_flow_projection_facts (
    fact_id TEXT PRIMARY KEY REFERENCES daily_flow_sync_facts(id) ON DELETE CASCADE);
CREATE TABLE daily_flow_local_operation_rows (
    day_key TEXT NOT NULL, node_id TEXT NOT NULL, before_json TEXT,
    PRIMARY KEY(day_key, node_id));
CREATE TABLE daily_flow_local_operation_state (
    day_key TEXT PRIMARY KEY, base_json TEXT NOT NULL);
CREATE TABLE topic_daily_count_entries (
    id TEXT PRIMARY KEY NOT NULL,
    day_key TEXT NOT NULL,
    node_id TEXT NOT NULL,
    UNIQUE(day_key, node_id)
  );
CREATE TABLE topic_daily_count_coverage (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    started_at TEXT NOT NULL
  );
CREATE TABLE topic_daily_counts (
    day_key TEXT PRIMARY KEY NOT NULL,
    count INTEGER NOT NULL CHECK(count >= 0)
  );
CREATE TABLE foreground_daily_time (
    id TEXT PRIMARY KEY NOT NULL,
    source_id TEXT NOT NULL,
    day_key TEXT NOT NULL,
    duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
    UNIQUE(source_id, day_key)
  );
CREATE TABLE foreground_time_coverage (
    id INTEGER PRIMARY KEY CHECK(id = 1), started_at TEXT NOT NULL
  );
CREATE TABLE import_runs (
    id TEXT PRIMARY KEY,
    source_fingerprint TEXT NOT NULL,
    provider TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    content_fingerprint TEXT NOT NULL,
    duplicate_semantic TEXT NOT NULL,
    result_status TEXT NOT NULL,
    node_id TEXT,
    imported_at TEXT NOT NULL,
    degraded_reason TEXT,
    failure_reason TEXT
  );
CREATE TABLE desktop_sources (
    source_ref TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('external', 'watched', 'readwise')),
    config_ref TEXT NOT NULL,
    host_name TEXT NOT NULL,
    host_platform TEXT NOT NULL,
    root_path TEXT NOT NULL,
    path_flavor TEXT NOT NULL CHECK (path_flavor IN ('posix', 'windows')),
    type_settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (source_type, config_ref)
  );
CREATE TABLE content_blobs (
    hash TEXT PRIMARY KEY,
    storage_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime_type TEXT,
    compression TEXT NOT NULL DEFAULT 'none',
    original_size_bytes INTEGER NOT NULL,
    stored_size_bytes INTEGER NOT NULL,
    original_sha256 TEXT NOT NULL,
    stored_sha256 TEXT NOT NULL,
    availability TEXT NOT NULL DEFAULT 'missing',
    source_host_name TEXT,
    created_at TEXT NOT NULL,
    cached_at TEXT,
    last_verified_at TEXT
  );
CREATE TABLE content_blob_data (
    hash TEXT PRIMARY KEY,
    data BLOB NOT NULL
  );
CREATE TABLE pdf_page_text (
    attachment_id TEXT NOT NULL,
    page INTEGER NOT NULL,
    text TEXT NOT NULL,
    page_width REAL,
    page_height REAL,
    PRIMARY KEY (attachment_id, page)
  );
CREATE TABLE import_sources (
    source_fingerprint TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    first_imported_at TEXT NOT NULL,
    last_imported_at TEXT NOT NULL,
    last_content_fingerprint TEXT NOT NULL,
    latest_node_id TEXT,
    watched_binding_id TEXT,
    watched_relative_path TEXT,
    source_ref TEXT,
    source_location TEXT,
    remote_provider TEXT,
    remote_connection_ref TEXT,
    remote_document_id TEXT,
    remote_annotations_json TEXT NOT NULL DEFAULT '[]',
    remote_import_state_json TEXT NOT NULL DEFAULT '{}'
  );
CREATE TABLE external_search_folders (
    id TEXT PRIMARY KEY,
    folder_path TEXT NOT NULL,
    attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT,
    excluded_dirs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle',
    document_count INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_ref TEXT NOT NULL
  );
CREATE TABLE watched_folder_bindings (
    binding_id TEXT PRIMARY KEY,
    connection_status TEXT NOT NULL DEFAULT 'needs-folder'
      CHECK (connection_status IN ('connected', 'needs-folder')),
    action_mode TEXT NOT NULL,
    archive_path TEXT NOT NULL DEFAULT '',
    highlight_mode TEXT NOT NULL,
    highlight_path TEXT NOT NULL DEFAULT '',
    primary_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    source_ref TEXT NOT NULL,
    owner_device_identity_key TEXT,
    local_rule_id TEXT,
    reported_path TEXT NOT NULL DEFAULT ''
  );
CREATE TABLE external_documents (
    document_id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    extension TEXT NOT NULL,
    source_size_bytes INTEGER NOT NULL,
    source_modified_at TEXT NOT NULL,
    source_modified_ms INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    title TEXT,
    opening_text TEXT,
    body_blob_hash TEXT,
    content TEXT NOT NULL,
    reference_kind TEXT NOT NULL DEFAULT 'local_path',
    reference_json TEXT,
    indexed_at TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 1,
    missing_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE pdf_index_state (
    attachment_id TEXT PRIMARY KEY,
    status TEXT, indexed_at TEXT, error TEXT, version INTEGER, attempt INTEGER
  );
CREATE TABLE pdf_text_artifact (
  pdf_hash TEXT NOT NULL, extractor_version INTEGER NOT NULL, storage_key TEXT NOT NULL,
  PRIMARY KEY(pdf_hash, extractor_version));
CREATE TABLE setting_records (
    key TEXT NOT NULL,
    scope TEXT NOT NULL,
    platform TEXT NOT NULL,
    form_factor TEXT NOT NULL,
    host_name TEXT NOT NULL,
    value_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (key, scope, platform, form_factor, host_name)
  );
CREATE TABLE sync_object_state (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    state_seq INTEGER NOT NULL,
    current_version_id TEXT,
    content_hash TEXT NOT NULL,
    last_modified_by_host_name TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_dirty INTEGER NOT NULL DEFAULT 0,
    base_content_hash TEXT,
    PRIMARY KEY (object_type, object_id),
    UNIQUE (state_seq)
  );
CREATE TABLE sync_state_sequence (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    source_epoch TEXT NOT NULL,
    high_water INTEGER NOT NULL CHECK (high_water >= 0)
  );
CREATE TABLE sync_change_log (
    change_id TEXT PRIMARY KEY,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    change_type TEXT NOT NULL,
    host_name TEXT NOT NULL,
    base_version_id TEXT,
    result_version_id TEXT,
    content_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    applied_at TEXT
  );
CREATE TABLE sync_group_metadata (
  key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE sync_groups (
    group_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    workgroup_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE sync_group_devices (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    device_identity_key TEXT NOT NULL,
    device_anchor TEXT NOT NULL,
    canonical_library_path TEXT NOT NULL,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'left')),
    joined_at TEXT NOT NULL,
    left_at TEXT,
    last_seen_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, device_identity_key)
  );
CREATE TABLE sync_group_local_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    local_device_identity_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state = 'active'),
    updated_at TEXT NOT NULL
  );
CREATE TABLE sync_group_nonce_ledger (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    identity TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, identity)
  );
CREATE TABLE sync_group_removal_decisions (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    decision_id TEXT NOT NULL,
    target_device_identity_key TEXT NOT NULL,
    initiated_by_device_identity_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    superseded_at TEXT,
    PRIMARY KEY (group_id, decision_id)
  );
CREATE TABLE sync_group_removal_confirmations (
    group_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    confirming_device_identity_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('enforced', 'target_exit')),
    confirmed_at TEXT NOT NULL,
    PRIMARY KEY (group_id, decision_id, confirming_device_identity_key),
    FOREIGN KEY (group_id, decision_id) REFERENCES sync_group_removal_decisions(group_id, decision_id)
      ON DELETE CASCADE
  );
CREATE TABLE sync_group_restore_events (
    restore_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    restored_at TEXT NOT NULL,
    source_device_identity_key TEXT NOT NULL,
    applied_at TEXT,
    created_at TEXT NOT NULL
  );
CREATE TABLE node_version_local_origins (
    version_id TEXT PRIMARY KEY REFERENCES node_sync_versions(version_id) ON DELETE CASCADE,
    content_edit_image_input_hash TEXT
  );
CREATE TABLE node_version_device_revisions (
    group_id TEXT NOT NULL,
    device_identity_key TEXT NOT NULL,
    library_epoch TEXT NOT NULL,
    proof_revision INTEGER NOT NULL,
    pack_id TEXT NOT NULL,
    blocked_reason TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, device_identity_key)
  );
CREATE TABLE node_version_local_holds (
    hold_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE node_version_local_proof_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    library_epoch TEXT NOT NULL,
    proof_revision INTEGER NOT NULL
  );
CREATE TABLE node_version_local_source_revisions (
    source_device_identity_key TEXT PRIMARY KEY,
    proof_revision INTEGER NOT NULL
  );
CREATE TABLE parent_order_sources (
    parent_id TEXT NOT NULL, author_id TEXT NOT NULL,
    counter INTEGER NOT NULL CHECK (counter >= 0 AND counter <= 9007199254740991),
    child_ids_json TEXT NOT NULL, PRIMARY KEY (parent_id, author_id));
CREATE TABLE parent_order_writer (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    binding_id TEXT NOT NULL, source_epoch TEXT NOT NULL, author_id TEXT NOT NULL);
CREATE TABLE parent_order_projection_pending (parent_id TEXT PRIMARY KEY);
CREATE TABLE attachment_parse_queue (
    article_id TEXT PRIMARY KEY, registered_at TEXT NOT NULL, attempted_at TEXT);
CREATE TABLE attachment_pending (
    article_id TEXT NOT NULL, storage_key TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('mount', 'body')),
    registered_at TEXT NOT NULL, attempted_at TEXT, PRIMARY KEY(article_id, source, storage_key));
CREATE TABLE folder_attachment_work (
  storage_key TEXT NOT NULL, stage TEXT NOT NULL CHECK(stage IN ('source','backup')),
  action TEXT NOT NULL CHECK(action IN ('copy','delete')), token TEXT NOT NULL,
  last_error TEXT, PRIMARY KEY(storage_key,stage));
CREATE TABLE sync_node_child_owners (
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, node_id TEXT NOT NULL,
    PRIMARY KEY(object_type, object_id));
CREATE TABLE framed_sync_inventory (
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, content_hash TEXT NOT NULL,
    frontier_json TEXT NOT NULL, relations_json TEXT NOT NULL, reviews_json TEXT NOT NULL,
    states_json TEXT NOT NULL, resources_json TEXT NOT NULL,
    PRIMARY KEY (object_type, object_id)
  );
CREATE TABLE framed_sync_version_summary (
    version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, body_hash TEXT,
    resource_hashes_json TEXT NOT NULL
  );
CREATE TABLE framed_sync_fact_summary (
    kind INTEGER NOT NULL, fact_id TEXT NOT NULL, object_id TEXT NOT NULL,
    PRIMARY KEY (kind, fact_id)
  );
CREATE TABLE framed_sync_resource_availability (
    hash TEXT PRIMARY KEY, available INTEGER NOT NULL CHECK(available IN (0, 1))
  );
CREATE TABLE framed_sync_node_digest (
    object_id TEXT PRIMARY KEY, shared_state_hash TEXT NOT NULL, unready INTEGER NOT NULL
  );
CREATE TABLE webdav_relay_review_sequence (
    state_seq INTEGER PRIMARY KEY,
    op_id TEXT NOT NULL UNIQUE
  );
CREATE TABLE foreground_time_owners (
  library_path TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL);
INSERT INTO "companion_meta" VALUES('device_id','v082-host','2026-11-01T00:00:00Z');
INSERT INTO "companion_meta" VALUES('host_name','v082-host','2026-11-01T00:00:00Z');
INSERT INTO "nodes" VALUES('special-inbox',NULL,'folder',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Inbox',1,0,'',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'[]',NULL,NULL,NULL,NULL,NULL,0,'2026-11-01T00:00:00Z','2026-11-01T00:00:00Z',NULL);
INSERT INTO "parent_child_order" VALUES('parent-child-order:root','["special-inbox"]','2026-11-01T00:00:00Z');
INSERT INTO "topic_daily_count_coverage" VALUES(1,'2026-11-21T06:15:23.615Z');
INSERT INTO "foreground_time_coverage" VALUES(1,'2026-11-21T06:15:23.615Z');
INSERT INTO "sync_state_sequence" VALUES(1,'78afccd6dcec2f2623334af434792be4',0);
INSERT INTO "node_version_local_proof_state" VALUES(1,'12d0e5e243d00085a0a77f07cdfe3364',0);
INSERT INTO "parent_order_projection_pending" VALUES('parent-child-order:root');
INSERT INTO "attachment_parse_queue" VALUES('special-inbox','2026-11-21T06:15:23.642Z',NULL);
CREATE INDEX idx_node_sync_tombstones_created
    ON node_sync_tombstones (created_at, version_id);
CREATE INDEX idx_node_sync_conflicts_object_detected
    ON node_sync_conflicts (object_id, detected_at);
CREATE INDEX idx_node_text_alternatives_active
    ON node_text_alternatives(node_id, status, created_at);
CREATE INDEX idx_nodes_parent_id ON nodes (parent_id);
CREATE INDEX idx_nodes_dirty_or_unversioned_updated
    ON nodes (updated_at)
    WHERE sync_dirty = 1 OR current_version_id IS NULL;
CREATE INDEX idx_nodes_deleted_at ON nodes (deleted_at);
CREATE INDEX idx_nodes_body_blob_hash
    ON nodes (body_blob_hash)
    WHERE body_blob_hash IS NOT NULL;
CREATE INDEX idx_node_review_due ON node_review (due);
CREATE INDEX idx_node_reading_state_next_at ON node_reading (state, next_at);
CREATE INDEX idx_review_log_node_id ON review_log (node_id);
CREATE INDEX idx_review_log_reviewed_at_op ON review_log (reviewed_at, op_id);
CREATE INDEX idx_review_log_host_name ON review_log (host_name);
CREATE INDEX daily_flow_cycle_order ON daily_flow_entries(active, order_key);
CREATE INDEX daily_flow_sync_day ON daily_flow_sync_facts(day_start, occurred_at, id);
CREATE INDEX daily_flow_sync_root ON daily_flow_sync_facts(root_id, occurred_at, id);
CREATE INDEX daily_flow_action_time ON daily_flow_sync_facts(occurred_at, id);
CREATE INDEX daily_flow_sync_create ON daily_flow_sync_facts(kind, day_start DESC);
CREATE INDEX daily_flow_sync_interval ON daily_flow_sync_facts(day_end, day_start);
CREATE INDEX daily_flow_sync_parent ON daily_flow_sync_facts(root_id, parent_id);
CREATE INDEX idx_node_sync_versions_object_created
    ON node_sync_versions (object_id, created_at);
CREATE INDEX idx_node_sync_versions_parent
    ON node_sync_versions (parent_version_id);
CREATE INDEX idx_node_sync_version_parents_parent
    ON node_sync_version_parents (parent_version_id);
CREATE INDEX idx_nodes_anchor_source_version
    ON nodes (anchor_source_version_id);
CREATE INDEX foreground_daily_time_day ON foreground_daily_time(day_key);
CREATE INDEX idx_desktop_sources_host
    ON desktop_sources (host_name, source_type, updated_at);
CREATE INDEX idx_content_blobs_availability
    ON content_blobs (availability);
CREATE INDEX idx_content_blobs_kind
    ON content_blobs (kind);
CREATE UNIQUE INDEX idx_import_sources_readwise_remote_document
    ON import_sources (remote_connection_ref, remote_document_id)
    WHERE remote_provider = 'readwise' AND remote_connection_ref IS NOT NULL AND remote_document_id IS NOT NULL;
CREATE UNIQUE INDEX idx_import_sources_readwise_remote_topic
    ON import_sources (remote_connection_ref, latest_node_id)
    WHERE remote_provider = 'readwise' AND remote_connection_ref IS NOT NULL AND latest_node_id IS NOT NULL;
CREATE INDEX idx_watched_folder_bindings_source
    ON watched_folder_bindings (source_ref, updated_at);
CREATE INDEX idx_setting_records_lookup
    ON setting_records (key, scope, platform, form_factor, updated_at);
CREATE INDEX idx_setting_records_host
    ON setting_records (host_name, updated_at);
CREATE INDEX idx_sync_object_state_seq
    ON sync_object_state (state_seq);
CREATE INDEX idx_sync_object_state_type_seq
    ON sync_object_state (object_type, state_seq);
CREATE INDEX idx_sync_change_log_object
    ON sync_change_log (object_type, object_id, created_at);
CREATE INDEX idx_sync_change_log_host_created
    ON sync_change_log (host_name, created_at);
CREATE INDEX idx_sync_change_log_created
    ON sync_change_log (created_at, change_id);
CREATE INDEX idx_sync_change_log_result_version
    ON sync_change_log (result_version_id);
CREATE INDEX idx_sync_group_devices_state
    ON sync_group_devices (group_id, state, updated_at);
CREATE INDEX idx_sync_group_removal_target
    ON sync_group_removal_decisions (group_id, target_device_identity_key, completed_at);
CREATE INDEX idx_sync_group_restore_events_latest
    ON sync_group_restore_events (group_id, restored_at DESC, restore_id DESC);
CREATE INDEX idx_node_version_local_holds_object
    ON node_version_local_holds (object_id, version_id);
CREATE INDEX attachment_parse_order ON attachment_parse_queue
    (COALESCE(attempted_at, registered_at), article_id);
CREATE INDEX attachment_pending_order ON attachment_pending(attempted_at, registered_at, article_id, source, storage_key);
CREATE INDEX attachment_pending_key ON attachment_pending(storage_key);
CREATE INDEX idx_sync_node_child_owners_node ON sync_node_child_owners(node_id);
CREATE INDEX idx_sync_topic_daily_owner_lookup
  ON sync_object_state(object_type, substr(object_id, 12)) WHERE object_type = 'topic_daily_count';
CREATE INDEX idx_framed_sync_version_summary_object
    ON framed_sync_version_summary(object_id, version_id);
CREATE INDEX idx_framed_sync_fact_summary_object
    ON framed_sync_fact_summary(object_id, kind, fact_id);
CREATE INDEX idx_framed_sync_fact_summary_parent_version
    ON framed_sync_fact_summary(kind, json_extract(fact_id, '$[0]'), fact_id) WHERE kind = 3;
CREATE INDEX idx_nodes_current_version_id ON nodes(current_version_id);
CREATE INDEX idx_node_sync_tombstones_version_id ON node_sync_tombstones(version_id);
CREATE TRIGGER daily_flow_node_review_insert AFTER INSERT ON node_review

      BEGIN UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1; END;
CREATE TRIGGER daily_flow_node_review_update AFTER UPDATE ON node_review
      WHEN OLD.node_id IS NOT NEW.node_id OR OLD.due IS NOT NEW.due OR OLD.last_review_at IS NOT NEW.last_review_at OR OLD.state IS NOT NEW.state OR OLD.stability IS NOT NEW.stability OR OLD.stability_fast IS NOT NEW.stability_fast OR OLD.difficulty IS NOT NEW.difficulty OR OLD.elapsed_days IS NOT NEW.elapsed_days OR OLD.scheduled_days IS NOT NEW.scheduled_days OR OLD.reps IS NOT NEW.reps OR OLD.lapses IS NOT NEW.lapses
      BEGIN UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1; END;
CREATE TRIGGER daily_flow_node_review_delete AFTER DELETE ON node_review

      BEGIN UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1; END;
CREATE TRIGGER daily_flow_node_reading_insert AFTER INSERT ON node_reading

      BEGIN UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1; END;
CREATE TRIGGER daily_flow_node_reading_update AFTER UPDATE ON node_reading
      WHEN OLD.node_id IS NOT NEW.node_id OR OLD.interval_duration_ms IS NOT NEW.interval_duration_ms OR OLD.interval_growth_factor IS NOT NEW.interval_growth_factor OR OLD.last_handled_at IS NOT NEW.last_handled_at OR OLD.next_at IS NOT NEW.next_at OR OLD.priority IS NOT NEW.priority OR OLD.repetition_count IS NOT NEW.repetition_count OR OLD.state IS NOT NEW.state
      BEGIN UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1; END;
CREATE TRIGGER daily_flow_node_reading_delete AFTER DELETE ON node_reading

      BEGIN UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1; END;
CREATE TRIGGER topic_daily_count_insert
    AFTER INSERT ON topic_daily_count_entries BEGIN
      INSERT INTO topic_daily_counts(day_key, count) VALUES (NEW.day_key, 1)
      ON CONFLICT(day_key) DO UPDATE SET count = count + 1;
    END;
CREATE TRIGGER trg_sync_state_sequence_insert
   AFTER INSERT ON sync_object_state BEGIN
     UPDATE sync_state_sequence SET high_water = MAX(high_water, NEW.state_seq)
     WHERE singleton_id = 1;
   END;
CREATE TRIGGER trg_sync_state_sequence_update
   AFTER UPDATE OF state_seq ON sync_object_state BEGIN
     UPDATE sync_state_sequence SET high_water = MAX(high_water, NEW.state_seq)
     WHERE singleton_id = 1;
   END;
CREATE TRIGGER trg_parent_order_node_insert AFTER INSERT ON nodes BEGIN
    INSERT INTO parent_order_projection_pending VALUES (COALESCE(NEW.parent_id, 'parent-child-order:root')) ON CONFLICT(parent_id) DO NOTHING;
  END;
CREATE TRIGGER trg_parent_order_node_update
    AFTER UPDATE OF parent_id, title, deleted_at ON nodes
    WHEN OLD.parent_id IS NOT NEW.parent_id OR OLD.title IS NOT NEW.title
      OR OLD.deleted_at IS NOT NEW.deleted_at BEGIN
    INSERT INTO parent_order_projection_pending VALUES (COALESCE(OLD.parent_id, 'parent-child-order:root')) ON CONFLICT(parent_id) DO NOTHING;
    INSERT INTO parent_order_projection_pending VALUES (COALESCE(NEW.parent_id, 'parent-child-order:root')) ON CONFLICT(parent_id) DO NOTHING;
  END;
CREATE TRIGGER trg_parent_order_node_delete AFTER DELETE ON nodes BEGIN
    INSERT INTO parent_order_projection_pending VALUES (COALESCE(OLD.parent_id, 'parent-child-order:root')) ON CONFLICT(parent_id) DO NOTHING;
  END;
CREATE TRIGGER attachment_demand_insert AFTER INSERT ON nodes
    BEGIN INSERT INTO attachment_parse_queue(article_id, registered_at)
  VALUES (NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(article_id) DO NOTHING; END;
CREATE TRIGGER attachment_demand_update
    AFTER UPDATE OF content, body_blob_hash, resource_references, deleted_at ON nodes
    WHEN OLD.content IS NOT NEW.content OR OLD.body_blob_hash IS NOT NEW.body_blob_hash
      OR OLD.resource_references IS NOT NEW.resource_references OR OLD.deleted_at IS NOT NEW.deleted_at
    BEGIN INSERT INTO attachment_parse_queue(article_id, registered_at)
  VALUES (NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(article_id) DO NOTHING; END;
CREATE TRIGGER attachment_demand_delete AFTER DELETE ON nodes
    BEGIN INSERT INTO attachment_parse_queue(article_id, registered_at)
  VALUES (OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(article_id) DO NOTHING; END;
CREATE TRIGGER trg_framed_digest_inventory_insert
    AFTER INSERT ON framed_sync_inventory BEGIN
      DELETE FROM framed_sync_node_digest WHERE object_id = NEW.object_id;

    END;
CREATE TRIGGER trg_framed_digest_inventory_update
    AFTER UPDATE ON framed_sync_inventory BEGIN
      DELETE FROM framed_sync_node_digest WHERE object_id = NEW.object_id;
      DELETE FROM framed_sync_node_digest WHERE object_id = OLD.object_id;
    END;
CREATE TRIGGER trg_framed_digest_inventory_delete
    AFTER DELETE ON framed_sync_inventory BEGIN
      DELETE FROM framed_sync_node_digest WHERE object_id = OLD.object_id;

    END;
CREATE TRIGGER trg_framed_digest_version_insert
    AFTER INSERT ON framed_sync_version_summary BEGIN
      DELETE FROM framed_sync_node_digest WHERE object_id = NEW.object_id;

    END;
CREATE TRIGGER trg_framed_digest_version_update
    AFTER UPDATE ON framed_sync_version_summary BEGIN
      DELETE FROM framed_sync_node_digest WHERE object_id = NEW.object_id;
      DELETE FROM framed_sync_node_digest WHERE object_id = OLD.object_id;
    END;
CREATE TRIGGER trg_framed_digest_version_delete
    AFTER DELETE ON framed_sync_version_summary BEGIN
      DELETE FROM framed_sync_node_digest WHERE object_id = OLD.object_id;

    END;
CREATE TRIGGER trg_framed_inventory_sync_object_state_insert
      AFTER INSERT ON sync_object_state BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (SELECT NEW.object_id UNION SELECT CASE
    WHEN NEW.object_type IN ('node_reading', 'node_open_state', 'parent_child_order')
      THEN NEW.object_id
    WHEN NEW.object_type = 'topic_daily_count' THEN substr(NEW.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = NEW.object_type AND owner.object_id = NEW.object_id) END);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (SELECT NEW.object_id UNION SELECT CASE
    WHEN NEW.object_type IN ('node_reading', 'node_open_state', 'parent_child_order')
      THEN NEW.object_id
    WHEN NEW.object_type = 'topic_daily_count' THEN substr(NEW.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = NEW.object_type AND owner.object_id = NEW.object_id) END)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_sync_object_state_update
      AFTER UPDATE ON sync_object_state BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (SELECT OLD.object_id UNION SELECT CASE
    WHEN OLD.object_type IN ('node_reading', 'node_open_state', 'parent_child_order')
      THEN OLD.object_id
    WHEN OLD.object_type = 'topic_daily_count' THEN substr(OLD.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = OLD.object_type AND owner.object_id = OLD.object_id) END);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (SELECT OLD.object_id UNION SELECT CASE
    WHEN OLD.object_type IN ('node_reading', 'node_open_state', 'parent_child_order')
      THEN OLD.object_id
    WHEN OLD.object_type = 'topic_daily_count' THEN substr(OLD.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = OLD.object_type AND owner.object_id = OLD.object_id) END)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (SELECT NEW.object_id UNION SELECT CASE
    WHEN NEW.object_type IN ('node_reading', 'node_open_state', 'parent_child_order')
      THEN NEW.object_id
    WHEN NEW.object_type = 'topic_daily_count' THEN substr(NEW.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = NEW.object_type AND owner.object_id = NEW.object_id) END);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (SELECT NEW.object_id UNION SELECT CASE
    WHEN NEW.object_type IN ('node_reading', 'node_open_state', 'parent_child_order')
      THEN NEW.object_id
    WHEN NEW.object_type = 'topic_daily_count' THEN substr(NEW.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = NEW.object_type AND owner.object_id = NEW.object_id) END)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_sync_object_state_delete
      AFTER DELETE ON sync_object_state BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (SELECT OLD.object_id UNION SELECT CASE
    WHEN OLD.object_type IN ('node_reading', 'node_open_state', 'parent_child_order')
      THEN OLD.object_id
    WHEN OLD.object_type = 'topic_daily_count' THEN substr(OLD.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = OLD.object_type AND owner.object_id = OLD.object_id) END);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (SELECT OLD.object_id UNION SELECT CASE
    WHEN OLD.object_type IN ('node_reading', 'node_open_state', 'parent_child_order')
      THEN OLD.object_id
    WHEN OLD.object_type = 'topic_daily_count' THEN substr(OLD.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = OLD.object_type AND owner.object_id = OLD.object_id) END)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_versions_insert
      AFTER INSERT ON node_sync_versions BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND json_extract(fact_id, '$[0]') = NEW.version_id
      AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE version_id = NEW.version_id);
    DELETE FROM framed_sync_version_summary WHERE version_id = NEW.version_id;
    INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        UNION SELECT json_extract(value, '$.body_blob_hash') AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternatives'), '[]'))
        WHERE version.body_text IS NOT NULL
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE version_id = NEW.version_id;
    INSERT INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT tomb.version_id, tomb.node_id,
      CASE WHEN EXISTS (SELECT 1 FROM node_sync_versions version
        WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id
    AND version.content_hash = tomb.content_hash
    AND version.parent_version_id IS tomb.parent_version_id
    AND version.host_name = tomb.host_name AND version.created_at = tomb.created_at
    AND version.body_text IS NOT NULL AND json_extract(version.snapshot_json, '$.anchor_link') IS json_extract(tomb.snapshot_json, '$.anchor_link') AND json_extract(version.snapshot_json, '$.anchor_resolution_status') IS json_extract(tomb.snapshot_json, '$.anchor_resolution_status') AND json_extract(version.snapshot_json, '$.anchor_source_version_id') IS json_extract(tomb.snapshot_json, '$.anchor_source_version_id') AND json_extract(version.snapshot_json, '$.attachments') IS json_extract(tomb.snapshot_json, '$.attachments') AND json_extract(version.snapshot_json, '$.text_alternatives') IS json_extract(tomb.snapshot_json, '$.text_alternatives') AND json_extract(version.snapshot_json, '$.text_selection') IS json_extract(tomb.snapshot_json, '$.text_selection') AND json_extract(version.snapshot_json, '$.created_at') IS json_extract(tomb.snapshot_json, '$.created_at') AND json_extract(version.snapshot_json, '$.deleted_at') IS json_extract(tomb.snapshot_json, '$.deleted_at') AND json_extract(version.snapshot_json, '$.desired_retention') IS json_extract(tomb.snapshot_json, '$.desired_retention') AND json_extract(version.snapshot_json, '$.enable_short_term') IS json_extract(tomb.snapshot_json, '$.enable_short_term') AND json_extract(version.snapshot_json, '$.hide_title_heading') IS json_extract(tomb.snapshot_json, '$.hide_title_heading') AND json_extract(version.snapshot_json, '$.id') IS json_extract(tomb.snapshot_json, '$.id') AND json_extract(version.snapshot_json, '$.image_regions') IS json_extract(tomb.snapshot_json, '$.image_regions') AND json_extract(version.snapshot_json, '$.image_sources') IS json_extract(tomb.snapshot_json, '$.image_sources') AND json_extract(version.snapshot_json, '$.import_content_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_content_fingerprint') AND json_extract(version.snapshot_json, '$.import_source_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_source_fingerprint') AND json_extract(version.snapshot_json, '$.is_title_manual') IS json_extract(tomb.snapshot_json, '$.is_title_manual') AND json_extract(version.snapshot_json, '$.kind') IS json_extract(tomb.snapshot_json, '$.kind') AND json_extract(version.snapshot_json, '$.manual_child_order') IS json_extract(tomb.snapshot_json, '$.manual_child_order') AND json_extract(version.snapshot_json, '$.opening_text') IS json_extract(tomb.snapshot_json, '$.opening_text') AND json_extract(version.snapshot_json, '$.parent_id') IS json_extract(tomb.snapshot_json, '$.parent_id') AND json_extract(version.snapshot_json, '$.priority') IS json_extract(tomb.snapshot_json, '$.priority') AND json_extract(version.snapshot_json, '$.resource_references') IS json_extract(tomb.snapshot_json, '$.resource_references') AND json_extract(version.snapshot_json, '$.reveal') IS json_extract(tomb.snapshot_json, '$.reveal') AND json_extract(version.snapshot_json, '$.sequential_reading_enabled') IS json_extract(tomb.snapshot_json, '$.sequential_reading_enabled') AND json_extract(version.snapshot_json, '$.shelved_at') IS json_extract(tomb.snapshot_json, '$.shelved_at') AND json_extract(version.snapshot_json, '$.title') IS json_extract(tomb.snapshot_json, '$.title') AND json_extract(version.snapshot_json, '$.updated_at') IS json_extract(tomb.snapshot_json, '$.updated_at') AND json_extract(version.snapshot_json, '$.virtual_filter') IS json_extract(tomb.snapshot_json, '$.virtual_filter') AND json_extract(version.snapshot_json, '$.initial_review_due') IS json_extract(tomb.snapshot_json, '$.initial_review_due'))
        THEN COALESCE((SELECT body_hash FROM framed_sync_version_summary
          WHERE version_id = tomb.version_id), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') ELSE 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE version_id = NEW.version_id
    ON CONFLICT(version_id) DO UPDATE SET object_id = excluded.object_id,
      body_hash = excluded.body_hash, resource_hashes_json = excluded.resource_hashes_json;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.object_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.object_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_versions_update
      AFTER UPDATE ON node_sync_versions BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND json_extract(fact_id, '$[0]') = OLD.version_id
      AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE version_id = OLD.version_id);
    DELETE FROM framed_sync_version_summary WHERE version_id = OLD.version_id;
    INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        UNION SELECT json_extract(value, '$.body_blob_hash') AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternatives'), '[]'))
        WHERE version.body_text IS NOT NULL
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE version_id = OLD.version_id;
    INSERT INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT tomb.version_id, tomb.node_id,
      CASE WHEN EXISTS (SELECT 1 FROM node_sync_versions version
        WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id
    AND version.content_hash = tomb.content_hash
    AND version.parent_version_id IS tomb.parent_version_id
    AND version.host_name = tomb.host_name AND version.created_at = tomb.created_at
    AND version.body_text IS NOT NULL AND json_extract(version.snapshot_json, '$.anchor_link') IS json_extract(tomb.snapshot_json, '$.anchor_link') AND json_extract(version.snapshot_json, '$.anchor_resolution_status') IS json_extract(tomb.snapshot_json, '$.anchor_resolution_status') AND json_extract(version.snapshot_json, '$.anchor_source_version_id') IS json_extract(tomb.snapshot_json, '$.anchor_source_version_id') AND json_extract(version.snapshot_json, '$.attachments') IS json_extract(tomb.snapshot_json, '$.attachments') AND json_extract(version.snapshot_json, '$.text_alternatives') IS json_extract(tomb.snapshot_json, '$.text_alternatives') AND json_extract(version.snapshot_json, '$.text_selection') IS json_extract(tomb.snapshot_json, '$.text_selection') AND json_extract(version.snapshot_json, '$.created_at') IS json_extract(tomb.snapshot_json, '$.created_at') AND json_extract(version.snapshot_json, '$.deleted_at') IS json_extract(tomb.snapshot_json, '$.deleted_at') AND json_extract(version.snapshot_json, '$.desired_retention') IS json_extract(tomb.snapshot_json, '$.desired_retention') AND json_extract(version.snapshot_json, '$.enable_short_term') IS json_extract(tomb.snapshot_json, '$.enable_short_term') AND json_extract(version.snapshot_json, '$.hide_title_heading') IS json_extract(tomb.snapshot_json, '$.hide_title_heading') AND json_extract(version.snapshot_json, '$.id') IS json_extract(tomb.snapshot_json, '$.id') AND json_extract(version.snapshot_json, '$.image_regions') IS json_extract(tomb.snapshot_json, '$.image_regions') AND json_extract(version.snapshot_json, '$.image_sources') IS json_extract(tomb.snapshot_json, '$.image_sources') AND json_extract(version.snapshot_json, '$.import_content_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_content_fingerprint') AND json_extract(version.snapshot_json, '$.import_source_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_source_fingerprint') AND json_extract(version.snapshot_json, '$.is_title_manual') IS json_extract(tomb.snapshot_json, '$.is_title_manual') AND json_extract(version.snapshot_json, '$.kind') IS json_extract(tomb.snapshot_json, '$.kind') AND json_extract(version.snapshot_json, '$.manual_child_order') IS json_extract(tomb.snapshot_json, '$.manual_child_order') AND json_extract(version.snapshot_json, '$.opening_text') IS json_extract(tomb.snapshot_json, '$.opening_text') AND json_extract(version.snapshot_json, '$.parent_id') IS json_extract(tomb.snapshot_json, '$.parent_id') AND json_extract(version.snapshot_json, '$.priority') IS json_extract(tomb.snapshot_json, '$.priority') AND json_extract(version.snapshot_json, '$.resource_references') IS json_extract(tomb.snapshot_json, '$.resource_references') AND json_extract(version.snapshot_json, '$.reveal') IS json_extract(tomb.snapshot_json, '$.reveal') AND json_extract(version.snapshot_json, '$.sequential_reading_enabled') IS json_extract(tomb.snapshot_json, '$.sequential_reading_enabled') AND json_extract(version.snapshot_json, '$.shelved_at') IS json_extract(tomb.snapshot_json, '$.shelved_at') AND json_extract(version.snapshot_json, '$.title') IS json_extract(tomb.snapshot_json, '$.title') AND json_extract(version.snapshot_json, '$.updated_at') IS json_extract(tomb.snapshot_json, '$.updated_at') AND json_extract(version.snapshot_json, '$.virtual_filter') IS json_extract(tomb.snapshot_json, '$.virtual_filter') AND json_extract(version.snapshot_json, '$.initial_review_due') IS json_extract(tomb.snapshot_json, '$.initial_review_due'))
        THEN COALESCE((SELECT body_hash FROM framed_sync_version_summary
          WHERE version_id = tomb.version_id), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') ELSE 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE version_id = OLD.version_id
    ON CONFLICT(version_id) DO UPDATE SET object_id = excluded.object_id,
      body_hash = excluded.body_hash, resource_hashes_json = excluded.resource_hashes_json;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.object_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.object_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));

    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND json_extract(fact_id, '$[0]') = NEW.version_id
      AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE version_id = NEW.version_id);
    DELETE FROM framed_sync_version_summary WHERE version_id = NEW.version_id;
    INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        UNION SELECT json_extract(value, '$.body_blob_hash') AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternatives'), '[]'))
        WHERE version.body_text IS NOT NULL
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE version_id = NEW.version_id;
    INSERT INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT tomb.version_id, tomb.node_id,
      CASE WHEN EXISTS (SELECT 1 FROM node_sync_versions version
        WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id
    AND version.content_hash = tomb.content_hash
    AND version.parent_version_id IS tomb.parent_version_id
    AND version.host_name = tomb.host_name AND version.created_at = tomb.created_at
    AND version.body_text IS NOT NULL AND json_extract(version.snapshot_json, '$.anchor_link') IS json_extract(tomb.snapshot_json, '$.anchor_link') AND json_extract(version.snapshot_json, '$.anchor_resolution_status') IS json_extract(tomb.snapshot_json, '$.anchor_resolution_status') AND json_extract(version.snapshot_json, '$.anchor_source_version_id') IS json_extract(tomb.snapshot_json, '$.anchor_source_version_id') AND json_extract(version.snapshot_json, '$.attachments') IS json_extract(tomb.snapshot_json, '$.attachments') AND json_extract(version.snapshot_json, '$.text_alternatives') IS json_extract(tomb.snapshot_json, '$.text_alternatives') AND json_extract(version.snapshot_json, '$.text_selection') IS json_extract(tomb.snapshot_json, '$.text_selection') AND json_extract(version.snapshot_json, '$.created_at') IS json_extract(tomb.snapshot_json, '$.created_at') AND json_extract(version.snapshot_json, '$.deleted_at') IS json_extract(tomb.snapshot_json, '$.deleted_at') AND json_extract(version.snapshot_json, '$.desired_retention') IS json_extract(tomb.snapshot_json, '$.desired_retention') AND json_extract(version.snapshot_json, '$.enable_short_term') IS json_extract(tomb.snapshot_json, '$.enable_short_term') AND json_extract(version.snapshot_json, '$.hide_title_heading') IS json_extract(tomb.snapshot_json, '$.hide_title_heading') AND json_extract(version.snapshot_json, '$.id') IS json_extract(tomb.snapshot_json, '$.id') AND json_extract(version.snapshot_json, '$.image_regions') IS json_extract(tomb.snapshot_json, '$.image_regions') AND json_extract(version.snapshot_json, '$.image_sources') IS json_extract(tomb.snapshot_json, '$.image_sources') AND json_extract(version.snapshot_json, '$.import_content_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_content_fingerprint') AND json_extract(version.snapshot_json, '$.import_source_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_source_fingerprint') AND json_extract(version.snapshot_json, '$.is_title_manual') IS json_extract(tomb.snapshot_json, '$.is_title_manual') AND json_extract(version.snapshot_json, '$.kind') IS json_extract(tomb.snapshot_json, '$.kind') AND json_extract(version.snapshot_json, '$.manual_child_order') IS json_extract(tomb.snapshot_json, '$.manual_child_order') AND json_extract(version.snapshot_json, '$.opening_text') IS json_extract(tomb.snapshot_json, '$.opening_text') AND json_extract(version.snapshot_json, '$.parent_id') IS json_extract(tomb.snapshot_json, '$.parent_id') AND json_extract(version.snapshot_json, '$.priority') IS json_extract(tomb.snapshot_json, '$.priority') AND json_extract(version.snapshot_json, '$.resource_references') IS json_extract(tomb.snapshot_json, '$.resource_references') AND json_extract(version.snapshot_json, '$.reveal') IS json_extract(tomb.snapshot_json, '$.reveal') AND json_extract(version.snapshot_json, '$.sequential_reading_enabled') IS json_extract(tomb.snapshot_json, '$.sequential_reading_enabled') AND json_extract(version.snapshot_json, '$.shelved_at') IS json_extract(tomb.snapshot_json, '$.shelved_at') AND json_extract(version.snapshot_json, '$.title') IS json_extract(tomb.snapshot_json, '$.title') AND json_extract(version.snapshot_json, '$.updated_at') IS json_extract(tomb.snapshot_json, '$.updated_at') AND json_extract(version.snapshot_json, '$.virtual_filter') IS json_extract(tomb.snapshot_json, '$.virtual_filter') AND json_extract(version.snapshot_json, '$.initial_review_due') IS json_extract(tomb.snapshot_json, '$.initial_review_due'))
        THEN COALESCE((SELECT body_hash FROM framed_sync_version_summary
          WHERE version_id = tomb.version_id), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') ELSE 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE version_id = NEW.version_id
    ON CONFLICT(version_id) DO UPDATE SET object_id = excluded.object_id,
      body_hash = excluded.body_hash, resource_hashes_json = excluded.resource_hashes_json;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.object_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.object_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_versions_delete
      AFTER DELETE ON node_sync_versions BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND json_extract(fact_id, '$[0]') = OLD.version_id
      AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE version_id = OLD.version_id);
    DELETE FROM framed_sync_version_summary WHERE version_id = OLD.version_id;
    INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        UNION SELECT json_extract(value, '$.body_blob_hash') AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternatives'), '[]'))
        WHERE version.body_text IS NOT NULL
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE version_id = OLD.version_id;
    INSERT INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT tomb.version_id, tomb.node_id,
      CASE WHEN EXISTS (SELECT 1 FROM node_sync_versions version
        WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id
    AND version.content_hash = tomb.content_hash
    AND version.parent_version_id IS tomb.parent_version_id
    AND version.host_name = tomb.host_name AND version.created_at = tomb.created_at
    AND version.body_text IS NOT NULL AND json_extract(version.snapshot_json, '$.anchor_link') IS json_extract(tomb.snapshot_json, '$.anchor_link') AND json_extract(version.snapshot_json, '$.anchor_resolution_status') IS json_extract(tomb.snapshot_json, '$.anchor_resolution_status') AND json_extract(version.snapshot_json, '$.anchor_source_version_id') IS json_extract(tomb.snapshot_json, '$.anchor_source_version_id') AND json_extract(version.snapshot_json, '$.attachments') IS json_extract(tomb.snapshot_json, '$.attachments') AND json_extract(version.snapshot_json, '$.text_alternatives') IS json_extract(tomb.snapshot_json, '$.text_alternatives') AND json_extract(version.snapshot_json, '$.text_selection') IS json_extract(tomb.snapshot_json, '$.text_selection') AND json_extract(version.snapshot_json, '$.created_at') IS json_extract(tomb.snapshot_json, '$.created_at') AND json_extract(version.snapshot_json, '$.deleted_at') IS json_extract(tomb.snapshot_json, '$.deleted_at') AND json_extract(version.snapshot_json, '$.desired_retention') IS json_extract(tomb.snapshot_json, '$.desired_retention') AND json_extract(version.snapshot_json, '$.enable_short_term') IS json_extract(tomb.snapshot_json, '$.enable_short_term') AND json_extract(version.snapshot_json, '$.hide_title_heading') IS json_extract(tomb.snapshot_json, '$.hide_title_heading') AND json_extract(version.snapshot_json, '$.id') IS json_extract(tomb.snapshot_json, '$.id') AND json_extract(version.snapshot_json, '$.image_regions') IS json_extract(tomb.snapshot_json, '$.image_regions') AND json_extract(version.snapshot_json, '$.image_sources') IS json_extract(tomb.snapshot_json, '$.image_sources') AND json_extract(version.snapshot_json, '$.import_content_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_content_fingerprint') AND json_extract(version.snapshot_json, '$.import_source_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_source_fingerprint') AND json_extract(version.snapshot_json, '$.is_title_manual') IS json_extract(tomb.snapshot_json, '$.is_title_manual') AND json_extract(version.snapshot_json, '$.kind') IS json_extract(tomb.snapshot_json, '$.kind') AND json_extract(version.snapshot_json, '$.manual_child_order') IS json_extract(tomb.snapshot_json, '$.manual_child_order') AND json_extract(version.snapshot_json, '$.opening_text') IS json_extract(tomb.snapshot_json, '$.opening_text') AND json_extract(version.snapshot_json, '$.parent_id') IS json_extract(tomb.snapshot_json, '$.parent_id') AND json_extract(version.snapshot_json, '$.priority') IS json_extract(tomb.snapshot_json, '$.priority') AND json_extract(version.snapshot_json, '$.resource_references') IS json_extract(tomb.snapshot_json, '$.resource_references') AND json_extract(version.snapshot_json, '$.reveal') IS json_extract(tomb.snapshot_json, '$.reveal') AND json_extract(version.snapshot_json, '$.sequential_reading_enabled') IS json_extract(tomb.snapshot_json, '$.sequential_reading_enabled') AND json_extract(version.snapshot_json, '$.shelved_at') IS json_extract(tomb.snapshot_json, '$.shelved_at') AND json_extract(version.snapshot_json, '$.title') IS json_extract(tomb.snapshot_json, '$.title') AND json_extract(version.snapshot_json, '$.updated_at') IS json_extract(tomb.snapshot_json, '$.updated_at') AND json_extract(version.snapshot_json, '$.virtual_filter') IS json_extract(tomb.snapshot_json, '$.virtual_filter') AND json_extract(version.snapshot_json, '$.initial_review_due') IS json_extract(tomb.snapshot_json, '$.initial_review_due'))
        THEN COALESCE((SELECT body_hash FROM framed_sync_version_summary
          WHERE version_id = tomb.version_id), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') ELSE 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE version_id = OLD.version_id
    ON CONFLICT(version_id) DO UPDATE SET object_id = excluded.object_id,
      body_hash = excluded.body_hash, resource_hashes_json = excluded.resource_hashes_json;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.object_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.object_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_tombstones_insert
      AFTER INSERT ON node_sync_tombstones BEGIN
    DELETE FROM framed_sync_version_summary WHERE version_id = NEW.version_id;
    INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        UNION SELECT json_extract(value, '$.body_blob_hash') AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternatives'), '[]'))
        WHERE version.body_text IS NOT NULL
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE version_id = NEW.version_id;
    INSERT INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT tomb.version_id, tomb.node_id,
      CASE WHEN EXISTS (SELECT 1 FROM node_sync_versions version
        WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id
    AND version.content_hash = tomb.content_hash
    AND version.parent_version_id IS tomb.parent_version_id
    AND version.host_name = tomb.host_name AND version.created_at = tomb.created_at
    AND version.body_text IS NOT NULL AND json_extract(version.snapshot_json, '$.anchor_link') IS json_extract(tomb.snapshot_json, '$.anchor_link') AND json_extract(version.snapshot_json, '$.anchor_resolution_status') IS json_extract(tomb.snapshot_json, '$.anchor_resolution_status') AND json_extract(version.snapshot_json, '$.anchor_source_version_id') IS json_extract(tomb.snapshot_json, '$.anchor_source_version_id') AND json_extract(version.snapshot_json, '$.attachments') IS json_extract(tomb.snapshot_json, '$.attachments') AND json_extract(version.snapshot_json, '$.text_alternatives') IS json_extract(tomb.snapshot_json, '$.text_alternatives') AND json_extract(version.snapshot_json, '$.text_selection') IS json_extract(tomb.snapshot_json, '$.text_selection') AND json_extract(version.snapshot_json, '$.created_at') IS json_extract(tomb.snapshot_json, '$.created_at') AND json_extract(version.snapshot_json, '$.deleted_at') IS json_extract(tomb.snapshot_json, '$.deleted_at') AND json_extract(version.snapshot_json, '$.desired_retention') IS json_extract(tomb.snapshot_json, '$.desired_retention') AND json_extract(version.snapshot_json, '$.enable_short_term') IS json_extract(tomb.snapshot_json, '$.enable_short_term') AND json_extract(version.snapshot_json, '$.hide_title_heading') IS json_extract(tomb.snapshot_json, '$.hide_title_heading') AND json_extract(version.snapshot_json, '$.id') IS json_extract(tomb.snapshot_json, '$.id') AND json_extract(version.snapshot_json, '$.image_regions') IS json_extract(tomb.snapshot_json, '$.image_regions') AND json_extract(version.snapshot_json, '$.image_sources') IS json_extract(tomb.snapshot_json, '$.image_sources') AND json_extract(version.snapshot_json, '$.import_content_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_content_fingerprint') AND json_extract(version.snapshot_json, '$.import_source_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_source_fingerprint') AND json_extract(version.snapshot_json, '$.is_title_manual') IS json_extract(tomb.snapshot_json, '$.is_title_manual') AND json_extract(version.snapshot_json, '$.kind') IS json_extract(tomb.snapshot_json, '$.kind') AND json_extract(version.snapshot_json, '$.manual_child_order') IS json_extract(tomb.snapshot_json, '$.manual_child_order') AND json_extract(version.snapshot_json, '$.opening_text') IS json_extract(tomb.snapshot_json, '$.opening_text') AND json_extract(version.snapshot_json, '$.parent_id') IS json_extract(tomb.snapshot_json, '$.parent_id') AND json_extract(version.snapshot_json, '$.priority') IS json_extract(tomb.snapshot_json, '$.priority') AND json_extract(version.snapshot_json, '$.resource_references') IS json_extract(tomb.snapshot_json, '$.resource_references') AND json_extract(version.snapshot_json, '$.reveal') IS json_extract(tomb.snapshot_json, '$.reveal') AND json_extract(version.snapshot_json, '$.sequential_reading_enabled') IS json_extract(tomb.snapshot_json, '$.sequential_reading_enabled') AND json_extract(version.snapshot_json, '$.shelved_at') IS json_extract(tomb.snapshot_json, '$.shelved_at') AND json_extract(version.snapshot_json, '$.title') IS json_extract(tomb.snapshot_json, '$.title') AND json_extract(version.snapshot_json, '$.updated_at') IS json_extract(tomb.snapshot_json, '$.updated_at') AND json_extract(version.snapshot_json, '$.virtual_filter') IS json_extract(tomb.snapshot_json, '$.virtual_filter') AND json_extract(version.snapshot_json, '$.initial_review_due') IS json_extract(tomb.snapshot_json, '$.initial_review_due'))
        THEN COALESCE((SELECT body_hash FROM framed_sync_version_summary
          WHERE version_id = tomb.version_id), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') ELSE 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE version_id = NEW.version_id
    ON CONFLICT(version_id) DO UPDATE SET object_id = excluded.object_id,
      body_hash = excluded.body_hash, resource_hashes_json = excluded.resource_hashes_json;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_tombstones_update
      AFTER UPDATE ON node_sync_tombstones BEGIN
    DELETE FROM framed_sync_version_summary WHERE version_id = OLD.version_id;
    INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        UNION SELECT json_extract(value, '$.body_blob_hash') AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternatives'), '[]'))
        WHERE version.body_text IS NOT NULL
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE version_id = OLD.version_id;
    INSERT INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT tomb.version_id, tomb.node_id,
      CASE WHEN EXISTS (SELECT 1 FROM node_sync_versions version
        WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id
    AND version.content_hash = tomb.content_hash
    AND version.parent_version_id IS tomb.parent_version_id
    AND version.host_name = tomb.host_name AND version.created_at = tomb.created_at
    AND version.body_text IS NOT NULL AND json_extract(version.snapshot_json, '$.anchor_link') IS json_extract(tomb.snapshot_json, '$.anchor_link') AND json_extract(version.snapshot_json, '$.anchor_resolution_status') IS json_extract(tomb.snapshot_json, '$.anchor_resolution_status') AND json_extract(version.snapshot_json, '$.anchor_source_version_id') IS json_extract(tomb.snapshot_json, '$.anchor_source_version_id') AND json_extract(version.snapshot_json, '$.attachments') IS json_extract(tomb.snapshot_json, '$.attachments') AND json_extract(version.snapshot_json, '$.text_alternatives') IS json_extract(tomb.snapshot_json, '$.text_alternatives') AND json_extract(version.snapshot_json, '$.text_selection') IS json_extract(tomb.snapshot_json, '$.text_selection') AND json_extract(version.snapshot_json, '$.created_at') IS json_extract(tomb.snapshot_json, '$.created_at') AND json_extract(version.snapshot_json, '$.deleted_at') IS json_extract(tomb.snapshot_json, '$.deleted_at') AND json_extract(version.snapshot_json, '$.desired_retention') IS json_extract(tomb.snapshot_json, '$.desired_retention') AND json_extract(version.snapshot_json, '$.enable_short_term') IS json_extract(tomb.snapshot_json, '$.enable_short_term') AND json_extract(version.snapshot_json, '$.hide_title_heading') IS json_extract(tomb.snapshot_json, '$.hide_title_heading') AND json_extract(version.snapshot_json, '$.id') IS json_extract(tomb.snapshot_json, '$.id') AND json_extract(version.snapshot_json, '$.image_regions') IS json_extract(tomb.snapshot_json, '$.image_regions') AND json_extract(version.snapshot_json, '$.image_sources') IS json_extract(tomb.snapshot_json, '$.image_sources') AND json_extract(version.snapshot_json, '$.import_content_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_content_fingerprint') AND json_extract(version.snapshot_json, '$.import_source_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_source_fingerprint') AND json_extract(version.snapshot_json, '$.is_title_manual') IS json_extract(tomb.snapshot_json, '$.is_title_manual') AND json_extract(version.snapshot_json, '$.kind') IS json_extract(tomb.snapshot_json, '$.kind') AND json_extract(version.snapshot_json, '$.manual_child_order') IS json_extract(tomb.snapshot_json, '$.manual_child_order') AND json_extract(version.snapshot_json, '$.opening_text') IS json_extract(tomb.snapshot_json, '$.opening_text') AND json_extract(version.snapshot_json, '$.parent_id') IS json_extract(tomb.snapshot_json, '$.parent_id') AND json_extract(version.snapshot_json, '$.priority') IS json_extract(tomb.snapshot_json, '$.priority') AND json_extract(version.snapshot_json, '$.resource_references') IS json_extract(tomb.snapshot_json, '$.resource_references') AND json_extract(version.snapshot_json, '$.reveal') IS json_extract(tomb.snapshot_json, '$.reveal') AND json_extract(version.snapshot_json, '$.sequential_reading_enabled') IS json_extract(tomb.snapshot_json, '$.sequential_reading_enabled') AND json_extract(version.snapshot_json, '$.shelved_at') IS json_extract(tomb.snapshot_json, '$.shelved_at') AND json_extract(version.snapshot_json, '$.title') IS json_extract(tomb.snapshot_json, '$.title') AND json_extract(version.snapshot_json, '$.updated_at') IS json_extract(tomb.snapshot_json, '$.updated_at') AND json_extract(version.snapshot_json, '$.virtual_filter') IS json_extract(tomb.snapshot_json, '$.virtual_filter') AND json_extract(version.snapshot_json, '$.initial_review_due') IS json_extract(tomb.snapshot_json, '$.initial_review_due'))
        THEN COALESCE((SELECT body_hash FROM framed_sync_version_summary
          WHERE version_id = tomb.version_id), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') ELSE 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE version_id = OLD.version_id
    ON CONFLICT(version_id) DO UPDATE SET object_id = excluded.object_id,
      body_hash = excluded.body_hash, resource_hashes_json = excluded.resource_hashes_json;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));

    DELETE FROM framed_sync_version_summary WHERE version_id = NEW.version_id;
    INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        UNION SELECT json_extract(value, '$.body_blob_hash') AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternatives'), '[]'))
        WHERE version.body_text IS NOT NULL
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE version_id = NEW.version_id;
    INSERT INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT tomb.version_id, tomb.node_id,
      CASE WHEN EXISTS (SELECT 1 FROM node_sync_versions version
        WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id
    AND version.content_hash = tomb.content_hash
    AND version.parent_version_id IS tomb.parent_version_id
    AND version.host_name = tomb.host_name AND version.created_at = tomb.created_at
    AND version.body_text IS NOT NULL AND json_extract(version.snapshot_json, '$.anchor_link') IS json_extract(tomb.snapshot_json, '$.anchor_link') AND json_extract(version.snapshot_json, '$.anchor_resolution_status') IS json_extract(tomb.snapshot_json, '$.anchor_resolution_status') AND json_extract(version.snapshot_json, '$.anchor_source_version_id') IS json_extract(tomb.snapshot_json, '$.anchor_source_version_id') AND json_extract(version.snapshot_json, '$.attachments') IS json_extract(tomb.snapshot_json, '$.attachments') AND json_extract(version.snapshot_json, '$.text_alternatives') IS json_extract(tomb.snapshot_json, '$.text_alternatives') AND json_extract(version.snapshot_json, '$.text_selection') IS json_extract(tomb.snapshot_json, '$.text_selection') AND json_extract(version.snapshot_json, '$.created_at') IS json_extract(tomb.snapshot_json, '$.created_at') AND json_extract(version.snapshot_json, '$.deleted_at') IS json_extract(tomb.snapshot_json, '$.deleted_at') AND json_extract(version.snapshot_json, '$.desired_retention') IS json_extract(tomb.snapshot_json, '$.desired_retention') AND json_extract(version.snapshot_json, '$.enable_short_term') IS json_extract(tomb.snapshot_json, '$.enable_short_term') AND json_extract(version.snapshot_json, '$.hide_title_heading') IS json_extract(tomb.snapshot_json, '$.hide_title_heading') AND json_extract(version.snapshot_json, '$.id') IS json_extract(tomb.snapshot_json, '$.id') AND json_extract(version.snapshot_json, '$.image_regions') IS json_extract(tomb.snapshot_json, '$.image_regions') AND json_extract(version.snapshot_json, '$.image_sources') IS json_extract(tomb.snapshot_json, '$.image_sources') AND json_extract(version.snapshot_json, '$.import_content_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_content_fingerprint') AND json_extract(version.snapshot_json, '$.import_source_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_source_fingerprint') AND json_extract(version.snapshot_json, '$.is_title_manual') IS json_extract(tomb.snapshot_json, '$.is_title_manual') AND json_extract(version.snapshot_json, '$.kind') IS json_extract(tomb.snapshot_json, '$.kind') AND json_extract(version.snapshot_json, '$.manual_child_order') IS json_extract(tomb.snapshot_json, '$.manual_child_order') AND json_extract(version.snapshot_json, '$.opening_text') IS json_extract(tomb.snapshot_json, '$.opening_text') AND json_extract(version.snapshot_json, '$.parent_id') IS json_extract(tomb.snapshot_json, '$.parent_id') AND json_extract(version.snapshot_json, '$.priority') IS json_extract(tomb.snapshot_json, '$.priority') AND json_extract(version.snapshot_json, '$.resource_references') IS json_extract(tomb.snapshot_json, '$.resource_references') AND json_extract(version.snapshot_json, '$.reveal') IS json_extract(tomb.snapshot_json, '$.reveal') AND json_extract(version.snapshot_json, '$.sequential_reading_enabled') IS json_extract(tomb.snapshot_json, '$.sequential_reading_enabled') AND json_extract(version.snapshot_json, '$.shelved_at') IS json_extract(tomb.snapshot_json, '$.shelved_at') AND json_extract(version.snapshot_json, '$.title') IS json_extract(tomb.snapshot_json, '$.title') AND json_extract(version.snapshot_json, '$.updated_at') IS json_extract(tomb.snapshot_json, '$.updated_at') AND json_extract(version.snapshot_json, '$.virtual_filter') IS json_extract(tomb.snapshot_json, '$.virtual_filter') AND json_extract(version.snapshot_json, '$.initial_review_due') IS json_extract(tomb.snapshot_json, '$.initial_review_due'))
        THEN COALESCE((SELECT body_hash FROM framed_sync_version_summary
          WHERE version_id = tomb.version_id), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') ELSE 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE version_id = NEW.version_id
    ON CONFLICT(version_id) DO UPDATE SET object_id = excluded.object_id,
      body_hash = excluded.body_hash, resource_hashes_json = excluded.resource_hashes_json;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_tombstones_delete
      AFTER DELETE ON node_sync_tombstones BEGIN
    DELETE FROM framed_sync_version_summary WHERE version_id = OLD.version_id;
    INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        UNION SELECT json_extract(value, '$.body_blob_hash') AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternatives'), '[]'))
        WHERE version.body_text IS NOT NULL
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE version_id = OLD.version_id;
    INSERT INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT tomb.version_id, tomb.node_id,
      CASE WHEN EXISTS (SELECT 1 FROM node_sync_versions version
        WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id
    AND version.content_hash = tomb.content_hash
    AND version.parent_version_id IS tomb.parent_version_id
    AND version.host_name = tomb.host_name AND version.created_at = tomb.created_at
    AND version.body_text IS NOT NULL AND json_extract(version.snapshot_json, '$.anchor_link') IS json_extract(tomb.snapshot_json, '$.anchor_link') AND json_extract(version.snapshot_json, '$.anchor_resolution_status') IS json_extract(tomb.snapshot_json, '$.anchor_resolution_status') AND json_extract(version.snapshot_json, '$.anchor_source_version_id') IS json_extract(tomb.snapshot_json, '$.anchor_source_version_id') AND json_extract(version.snapshot_json, '$.attachments') IS json_extract(tomb.snapshot_json, '$.attachments') AND json_extract(version.snapshot_json, '$.text_alternatives') IS json_extract(tomb.snapshot_json, '$.text_alternatives') AND json_extract(version.snapshot_json, '$.text_selection') IS json_extract(tomb.snapshot_json, '$.text_selection') AND json_extract(version.snapshot_json, '$.created_at') IS json_extract(tomb.snapshot_json, '$.created_at') AND json_extract(version.snapshot_json, '$.deleted_at') IS json_extract(tomb.snapshot_json, '$.deleted_at') AND json_extract(version.snapshot_json, '$.desired_retention') IS json_extract(tomb.snapshot_json, '$.desired_retention') AND json_extract(version.snapshot_json, '$.enable_short_term') IS json_extract(tomb.snapshot_json, '$.enable_short_term') AND json_extract(version.snapshot_json, '$.hide_title_heading') IS json_extract(tomb.snapshot_json, '$.hide_title_heading') AND json_extract(version.snapshot_json, '$.id') IS json_extract(tomb.snapshot_json, '$.id') AND json_extract(version.snapshot_json, '$.image_regions') IS json_extract(tomb.snapshot_json, '$.image_regions') AND json_extract(version.snapshot_json, '$.image_sources') IS json_extract(tomb.snapshot_json, '$.image_sources') AND json_extract(version.snapshot_json, '$.import_content_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_content_fingerprint') AND json_extract(version.snapshot_json, '$.import_source_fingerprint') IS json_extract(tomb.snapshot_json, '$.import_source_fingerprint') AND json_extract(version.snapshot_json, '$.is_title_manual') IS json_extract(tomb.snapshot_json, '$.is_title_manual') AND json_extract(version.snapshot_json, '$.kind') IS json_extract(tomb.snapshot_json, '$.kind') AND json_extract(version.snapshot_json, '$.manual_child_order') IS json_extract(tomb.snapshot_json, '$.manual_child_order') AND json_extract(version.snapshot_json, '$.opening_text') IS json_extract(tomb.snapshot_json, '$.opening_text') AND json_extract(version.snapshot_json, '$.parent_id') IS json_extract(tomb.snapshot_json, '$.parent_id') AND json_extract(version.snapshot_json, '$.priority') IS json_extract(tomb.snapshot_json, '$.priority') AND json_extract(version.snapshot_json, '$.resource_references') IS json_extract(tomb.snapshot_json, '$.resource_references') AND json_extract(version.snapshot_json, '$.reveal') IS json_extract(tomb.snapshot_json, '$.reveal') AND json_extract(version.snapshot_json, '$.sequential_reading_enabled') IS json_extract(tomb.snapshot_json, '$.sequential_reading_enabled') AND json_extract(version.snapshot_json, '$.shelved_at') IS json_extract(tomb.snapshot_json, '$.shelved_at') AND json_extract(version.snapshot_json, '$.title') IS json_extract(tomb.snapshot_json, '$.title') AND json_extract(version.snapshot_json, '$.updated_at') IS json_extract(tomb.snapshot_json, '$.updated_at') AND json_extract(version.snapshot_json, '$.virtual_filter') IS json_extract(tomb.snapshot_json, '$.virtual_filter') AND json_extract(version.snapshot_json, '$.initial_review_due') IS json_extract(tomb.snapshot_json, '$.initial_review_due'))
        THEN COALESCE((SELECT body_hash FROM framed_sync_version_summary
          WHERE version_id = tomb.version_id), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') ELSE 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE version_id = OLD.version_id
    ON CONFLICT(version_id) DO UPDATE SET object_id = excluded.object_id,
      body_hash = excluded.body_hash, resource_hashes_json = excluded.resource_hashes_json;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_head_body
    AFTER UPDATE OF current_version_id ON nodes
    WHEN NEW.current_version_id IS NOT OLD.current_version_id BEGIN
      UPDATE framed_sync_version_summary SET body_hash = NEW.body_blob_hash
      WHERE version_id = NEW.current_version_id AND body_hash IS NULL
        AND NEW.body_blob_hash IS NOT NULL
        AND EXISTS (SELECT 1 FROM node_sync_versions version
          WHERE version.version_id = NEW.current_version_id AND version.body_text IS NOT NULL);
      DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
    END;
CREATE TRIGGER trg_framed_inventory_node_reading_insert
      AFTER INSERT ON node_reading BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_reading_update
      AFTER UPDATE ON node_reading BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_reading_delete
      AFTER DELETE ON node_reading BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_open_state_insert
      AFTER INSERT ON node_open_state BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_open_state_update
      AFTER UPDATE ON node_open_state BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_open_state_delete
      AFTER DELETE ON node_open_state BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_parent_order_sources_insert
      AFTER INSERT ON parent_order_sources BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.parent_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.parent_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_parent_order_sources_update
      AFTER UPDATE ON parent_order_sources BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.parent_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.parent_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.parent_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.parent_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_parent_order_sources_delete
      AFTER DELETE ON parent_order_sources BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.parent_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.parent_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_topic_daily_count_entries_insert
      AFTER INSERT ON topic_daily_count_entries BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_topic_daily_count_entries_update
      AFTER UPDATE ON topic_daily_count_entries BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_topic_daily_count_entries_delete
      AFTER DELETE ON topic_daily_count_entries BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_sync_node_child_owners_insert
      AFTER INSERT ON sync_node_child_owners BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_sync_node_child_owners_update
      AFTER UPDATE ON sync_node_child_owners BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_sync_node_child_owners_delete
      AFTER DELETE ON sync_node_child_owners BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_owner_node_text_alternatives_insert
     AFTER INSERT ON node_text_alternatives BEGIN
       DELETE FROM sync_node_child_owners WHERE object_type = 'node_text_alternative' AND object_id = NEW.alternative_id
         AND NEW.node_id IS NULL;
       INSERT INTO sync_node_child_owners (object_type, object_id, node_id)
         SELECT 'node_text_alternative', NEW.alternative_id, NEW.node_id WHERE NEW.node_id IS NOT NULL
         ON CONFLICT(object_type, object_id) DO UPDATE SET node_id = excluded.node_id;
     END;
CREATE TRIGGER trg_framed_inventory_owner_node_text_alternatives_update
     AFTER UPDATE ON node_text_alternatives BEGIN
       DELETE FROM sync_node_child_owners WHERE object_type = 'node_text_alternative' AND object_id = NEW.alternative_id
         AND NEW.node_id IS NULL;
       INSERT INTO sync_node_child_owners (object_type, object_id, node_id)
         SELECT 'node_text_alternative', NEW.alternative_id, NEW.node_id WHERE NEW.node_id IS NOT NULL
         ON CONFLICT(object_type, object_id) DO UPDATE SET node_id = excluded.node_id;
     END;
CREATE TRIGGER trg_framed_inventory_owner_import_sources_insert
     AFTER INSERT ON import_sources BEGIN
       DELETE FROM sync_node_child_owners WHERE object_type = 'import_source' AND object_id = NEW.source_fingerprint
         AND NEW.latest_node_id IS NULL;
       INSERT INTO sync_node_child_owners (object_type, object_id, node_id)
         SELECT 'import_source', NEW.source_fingerprint, NEW.latest_node_id WHERE NEW.latest_node_id IS NOT NULL
         ON CONFLICT(object_type, object_id) DO UPDATE SET node_id = excluded.node_id;
     END;
CREATE TRIGGER trg_framed_inventory_owner_import_sources_update
     AFTER UPDATE ON import_sources BEGIN
       DELETE FROM sync_node_child_owners WHERE object_type = 'import_source' AND object_id = NEW.source_fingerprint
         AND NEW.latest_node_id IS NULL;
       INSERT INTO sync_node_child_owners (object_type, object_id, node_id)
         SELECT 'import_source', NEW.source_fingerprint, NEW.latest_node_id WHERE NEW.latest_node_id IS NOT NULL
         ON CONFLICT(object_type, object_id) DO UPDATE SET node_id = excluded.node_id;
     END;
CREATE TRIGGER trg_framed_inventory_node_text_alternatives_insert
      AFTER INSERT ON node_text_alternatives BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_text_alternatives_update
      AFTER UPDATE ON node_text_alternatives BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_text_alternatives_delete
      AFTER DELETE ON node_text_alternatives BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_import_sources_insert
      AFTER INSERT ON import_sources BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.latest_node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.latest_node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_import_sources_update
      AFTER UPDATE ON import_sources BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.latest_node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.latest_node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));
DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.latest_node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.latest_node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_import_sources_delete
      AFTER DELETE ON import_sources BEGIN DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.latest_node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.latest_node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_version_parents_insert
      AFTER INSERT ON node_sync_version_parents BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND fact_id = json_array(NEW.version_id, NEW.parent_version_id, NEW.ordinal);
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 3, json_array(parent.version_id, parent.parent_version_id, parent.ordinal), version.object_id
      FROM node_sync_version_parents parent JOIN framed_sync_version_summary version
        ON version.version_id = parent.version_id
      WHERE parent.version_id = NEW.version_id AND parent.parent_version_id = NEW.parent_version_id
        AND parent.ordinal = NEW.ordinal;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN ((SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = NEW.version_id));
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN ((SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = NEW.version_id))
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_version_parents_update
      AFTER UPDATE ON node_sync_version_parents BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND fact_id = json_array(OLD.version_id, OLD.parent_version_id, OLD.ordinal);
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 3, json_array(parent.version_id, parent.parent_version_id, parent.ordinal), version.object_id
      FROM node_sync_version_parents parent JOIN framed_sync_version_summary version
        ON version.version_id = parent.version_id
      WHERE parent.version_id = OLD.version_id AND parent.parent_version_id = OLD.parent_version_id
        AND parent.ordinal = OLD.ordinal;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN ((SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = OLD.version_id));
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN ((SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = OLD.version_id))
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));

    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND fact_id = json_array(NEW.version_id, NEW.parent_version_id, NEW.ordinal);
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 3, json_array(parent.version_id, parent.parent_version_id, parent.ordinal), version.object_id
      FROM node_sync_version_parents parent JOIN framed_sync_version_summary version
        ON version.version_id = parent.version_id
      WHERE parent.version_id = NEW.version_id AND parent.parent_version_id = NEW.parent_version_id
        AND parent.ordinal = NEW.ordinal;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN ((SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = NEW.version_id));
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN ((SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = NEW.version_id))
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_node_sync_version_parents_delete
      AFTER DELETE ON node_sync_version_parents BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND fact_id = json_array(OLD.version_id, OLD.parent_version_id, OLD.ordinal);
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 3, json_array(parent.version_id, parent.parent_version_id, parent.ordinal), version.object_id
      FROM node_sync_version_parents parent JOIN framed_sync_version_summary version
        ON version.version_id = parent.version_id
      WHERE parent.version_id = OLD.version_id AND parent.parent_version_id = OLD.parent_version_id
        AND parent.ordinal = OLD.ordinal;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN ((SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = OLD.version_id));
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN ((SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = OLD.version_id))
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_review_log_insert
      AFTER INSERT ON review_log BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 4 AND fact_id = NEW.op_id;
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 4, op_id, node_id FROM review_log WHERE op_id = NEW.op_id;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_review_log_update
      AFTER UPDATE ON review_log BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 4 AND fact_id = OLD.op_id;
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 4, op_id, node_id FROM review_log WHERE op_id = OLD.op_id;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id));

    DELETE FROM framed_sync_fact_summary WHERE kind = 4 AND fact_id = NEW.op_id;
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 4, op_id, node_id FROM review_log WHERE op_id = NEW.op_id;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (NEW.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (NEW.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_framed_inventory_review_log_delete
      AFTER DELETE ON review_log BEGIN
    DELETE FROM framed_sync_fact_summary WHERE kind = 4 AND fact_id = OLD.op_id;
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 4, op_id, node_id FROM review_log WHERE op_id = OLD.op_id;
    DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (OLD.node_id);
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, json_array(state.content_hash, COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)),
      json(COALESCE((SELECT json_group_array(json(value)) FROM (
        SELECT json_array(version_id, content_hash, host_name, created_at,
          json_extract(snapshot_json, '$.body_blob_hash'),
          CASE WHEN json_extract(snapshot_json, '$.body_deleted') = 1 THEN 'deleted'
            WHEN body_text IS NOT NULL AND
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) =
              json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]'))
              THEN 'available' ELSE 'missing' END, parent_version_id) AS value
        FROM node_sync_versions WHERE object_id = state.object_id ORDER BY version_id)), '[]'))),
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_open_state', 'parent_child_order') AND object_id = state.object_id
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = +state.object_id
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = state.object_id
    ) child WHERE (child.deleted_at IS NOT NULL OR CASE child.object_type WHEN 'node_reading' THEN EXISTS (SELECT 1 FROM node_reading child WHERE child.node_id = child.object_id) WHEN 'node_open_state' THEN EXISTS (SELECT 1 FROM node_open_state child WHERE child.node_id = child.object_id) WHEN 'parent_child_order' THEN EXISTS (SELECT 1 FROM parent_order_sources child WHERE child.parent_id = child.object_id) WHEN 'node_text_alternative' THEN EXISTS (SELECT 1 FROM node_text_alternatives child WHERE child.alternative_id = child.object_id) WHEN 'topic_daily_count' THEN EXISTS (SELECT 1 FROM topic_daily_count_entries child WHERE child.id = child.object_id) WHEN 'import_source' THEN EXISTS (SELECT 1 FROM import_sources child WHERE child.source_fingerprint = child.object_id) ELSE 0 END)
    ORDER BY child.object_type, child.object_id)), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at)) AND body_hash IS NOT NULL
        UNION SELECT json_extract(body.value, '$.hash') AS hash
          FROM node_sync_versions version,
            json_each(COALESCE(json_extract(version.snapshot_json, '$.text_alternative_bodies'), '[]')) body
          WHERE version.version_id = COALESCE(state.current_version_id, (SELECT tomb.version_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id = state.object_id AND tomb.content_hash = state.content_hash
      AND tomb.deleted_at = state.deleted_at))
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (OLD.node_id)
      AND state.object_id != 'special-virtual-root'
      AND (state.current_version_id IS NOT NULL OR
        EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id)); END;
CREATE TRIGGER trg_webdav_relay_review_insert AFTER INSERT ON review_log BEGIN
    UPDATE sync_state_sequence SET high_water = high_water + 1 WHERE singleton_id = 1;
    INSERT INTO webdav_relay_review_sequence (state_seq, op_id)
      SELECT high_water, NEW.op_id FROM sync_state_sequence WHERE singleton_id = 1;
  END;
CREATE TRIGGER trg_webdav_relay_review_delete AFTER DELETE ON review_log BEGIN
    DELETE FROM webdav_relay_review_sequence WHERE op_id = OLD.op_id;
  END;
