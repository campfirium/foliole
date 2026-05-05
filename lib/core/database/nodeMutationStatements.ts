import type { DatabaseDriver } from './driver.js';

export function createUpsertNodeStatement(driver: DatabaseDriver) {
  return driver.prepare(
    `INSERT INTO nodes (
     id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, virtual_filter, reveal, anchor_link, image_regions, position,
       current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       parent_id = excluded.parent_id,
       kind = excluded.kind,
       priority = excluded.priority,
       desired_retention = excluded.desired_retention,
       title = excluded.title,
       is_title_manual = excluded.is_title_manual,
       hide_title_heading = excluded.hide_title_heading,
       content = excluded.content,
       opening_text = excluded.opening_text,
       virtual_filter = excluded.virtual_filter,
       reveal = excluded.reveal,
       anchor_link = excluded.anchor_link,
       image_regions = excluded.image_regions,
       position = excluded.position,
       last_modified_by_device_id = excluded.last_modified_by_device_id,
       sync_dirty = excluded.sync_dirty,
       updated_at = excluded.updated_at,
       deleted_at = NULL`
  );
}

export function createUpsertNodeOrderStatement(driver: DatabaseDriver) {
  return driver.prepare(
    `INSERT INTO node_order (node_id, position)
     VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`
  );
}

export function createUpsertNodeReadingStatement(driver: DatabaseDriver) {
  return driver.prepare(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
       next_at, priority, reading_position, repetition_count, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       interval_duration_ms = excluded.interval_duration_ms,
       interval_growth_factor = excluded.interval_growth_factor,
       last_handled_at = excluded.last_handled_at,
       next_at = excluded.next_at,
       priority = excluded.priority,
       reading_position = excluded.reading_position,
       repetition_count = excluded.repetition_count,
       state = excluded.state`
  );
}

export function createUpdateNodeAnchorLinkStatement(driver: DatabaseDriver) {
  return driver.prepare(
    `UPDATE nodes
     SET anchor_link = ?, updated_at = ?, deleted_at = NULL
     WHERE id = ?`
  );
}
