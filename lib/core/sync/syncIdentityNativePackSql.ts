/** Fixed SQLite copy surface for one globally identified candidate page. */
export const SYNC_IDENTITY_NATIVE_STATE_COPY_SQL = `INSERT INTO sync_object_state
  (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at)
  SELECT state.object_type, state.object_id, 0 AS state_seq, state.content_hash,
    state.last_modified_by_host_name, state.updated_at,
    CASE WHEN state.object_type = 'node_text_alternative' THEN COALESCE(state.deleted_at,
      (SELECT node.deleted_at FROM source.node_text_alternatives alternative
       JOIN source.nodes node ON node.id = alternative.node_id
       WHERE alternative.alternative_id = state.object_id)) ELSE state.deleted_at END
  FROM source.sync_object_state state
  JOIN selected_identity_objects selected
    ON selected.object_type = state.object_type AND selected.object_id = state.object_id
  WHERE state.object_type IN
    ('external_document','external_folder','import_source','node','node_open_state','node_reading',
     'node_review','node_text_alternative','parent_child_order','order_version','node_position','pdf_page_text','setting',
     'view_state','watched_folder','topic_daily_count')
    AND (state.object_type != 'node' OR state.deleted_at IS NOT NULL OR EXISTS
      (SELECT 1 FROM source.nodes WHERE id = state.object_id))
    AND (state.object_type NOT IN ('node_reading','node_review') OR state.deleted_at IS NOT NULL OR EXISTS
      (SELECT 1 FROM source.nodes WHERE id = state.object_id))`;

export const SYNC_IDENTITY_NATIVE_PRELUDE_COPY_SQL = `WITH RECURSIVE node_prelude(id, parent_id) AS (
    SELECT node.id, node.parent_id FROM source.nodes node WHERE node.id IN
      (SELECT object_id FROM sync_object_state WHERE object_type IN
         ('node','node_open_state','node_reading','node_review','parent_child_order')
       UNION SELECT alternative.node_id FROM source.node_text_alternatives alternative
         JOIN sync_object_state selected ON selected.object_type = 'node_text_alternative'
           AND selected.object_id = alternative.alternative_id)
    UNION SELECT parent.id, parent.parent_id FROM source.nodes parent
      JOIN node_prelude child ON child.parent_id = parent.id
  ) INSERT OR IGNORE INTO sync_object_state
  (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at)
  SELECT state.object_type, state.object_id, 0 AS state_seq, state.content_hash,
    state.last_modified_by_host_name, state.updated_at, state.deleted_at
  FROM source.sync_object_state state JOIN node_prelude prelude ON prelude.id = state.object_id
  WHERE state.object_type = 'node'`;

export const SYNC_IDENTITY_NATIVE_HEAD_COPY_SQL = `UPDATE sync_object_state
  SET current_version_id = (SELECT source.current_version_id
    FROM source.sync_object_state source
    WHERE source.object_type = sync_object_state.object_type
      AND source.object_id = sync_object_state.object_id)`;

export const SYNC_IDENTITY_NATIVE_REVIEW_COPY_SQL = `INSERT INTO review_log
  SELECT r.id, r.op_id, r.host_name, r.node_id, r.grade, r.scheduler_version,
    r.reviewed_at, r.due_before, r.stability_before, r.difficulty_before, r.due_after,
    r.stability_after, r.difficulty_after FROM source.review_log r
  WHERE r.node_id IN (SELECT object_id FROM sync_object_state
    WHERE object_type IN ('node', 'node_review'))`;

export const SYNC_IDENTITY_NATIVE_MISSING_ORIGINAL_HEAD_SQL = `SELECT tomb.version_id
  FROM source.node_sync_tombstones tomb JOIN sync_object_state state
    ON state.object_type = 'node' AND state.object_id = tomb.node_id
  WHERE NOT EXISTS (SELECT 1 FROM source.node_sync_versions version
    WHERE version.version_id = tomb.version_id AND version.object_id = tomb.node_id) LIMIT 1`;


/** Matches the shared global identity UTF-8 order, without a platform object-type routing table. */
export const SYNC_IDENTITY_NATIVE_THIN_PRELUDE_SQL = `SELECT CASE WHEN COUNT(*) > 0
  AND SUM(object_type COLLATE BINARY <= 'node') = 0 THEN 1 ELSE 0 END AS thin
  FROM selected_identity_objects`;
