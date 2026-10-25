import { PARENT_ORDER_PAYLOAD_SQL } from '../database/currentParentOrderSchema.js';

import { FOREGROUND_SOURCE_PAYLOAD_SQL } from './foregroundSource.js';

export const SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE = {
  foreground_source: FOREGROUND_SOURCE_PAYLOAD_SQL,
  topic_daily_count: `SELECT json_object('day_key', day_key, 'node_id', node_id)
    AS payload_json FROM topic_daily_count_entries WHERE id = ?`,
  parent_child_order: PARENT_ORDER_PAYLOAD_SQL,
  external_folder: `SELECT json_patch(json_patch(json_object(
    'id', f.id, 'attachment_mode', f.attachment_mode, 'excluded_dirs_json', f.excluded_dirs_json,
    'host_name', s.host_name, 'host_platform', s.host_platform, 'source_ref', f.source_ref
  ), CASE WHEN json_extract(s.type_settings_json, '$.ownerDeviceIdentityKey') IS NULL THEN '{}'
    ELSE json_object('owner_device_identity_key', json_extract(s.type_settings_json, '$.ownerDeviceIdentityKey')) END),
    CASE WHEN f.folder_path = '' THEN '{}' ELSE json_object('folder_path', f.folder_path) END)
    AS payload_json FROM external_search_folders f
    JOIN desktop_sources s ON s.source_ref = f.source_ref WHERE f.id = ?`,
  import_source: `SELECT json_object(
    'source_fingerprint', source_fingerprint, 'provider', provider, 'source_kind', source_kind,
    'source_name', source_name, 'source_locator', CASE WHEN watched_binding_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM desktop_sources s WHERE s.source_ref = import_sources.source_ref AND s.source_type = 'watched'
    ) THEN '' ELSE source_locator END,
    'first_imported_at', first_imported_at,
    'last_imported_at', last_imported_at, 'last_content_fingerprint', last_content_fingerprint,
    'latest_node_id', latest_node_id, 'watched_binding_id', watched_binding_id,
    'watched_relative_path', watched_relative_path, 'source_ref', source_ref,
    'source_location', source_location, 'remote_provider', remote_provider,
    'remote_connection_ref', remote_connection_ref, 'remote_document_id', remote_document_id,
    'remote_annotations_json', remote_annotations_json, 'remote_import_state_json', remote_import_state_json
  ) AS payload_json FROM import_sources WHERE source_fingerprint = ?`,
  node_open_state: `SELECT json_object('node_id', node_id, 'last_opened_at', last_opened_at) AS payload_json
    FROM node_open_state WHERE node_id = ?`,
  node_reading: `SELECT json_object(
    'node_id', node_id, 'interval_duration_ms', interval_duration_ms,
    'interval_growth_factor', interval_growth_factor, 'last_handled_at', last_handled_at,
    'next_at', next_at, 'priority', priority, 'repetition_count', repetition_count, 'state', state
  ) AS payload_json FROM node_reading WHERE node_id = ?`,
  node_text_alternative: `SELECT json_object(
    'alternative_id', alternative_id, 'node_id', node_id, 'source_version_id', source_version_id,
    'body_text', body_text, 'source_host_name', source_host_name, 'created_at', created_at,
    'status', status, 'updated_at', updated_at
  ) AS payload_json FROM node_text_alternatives WHERE alternative_id = ?`,
  setting: `SELECT json_object(
    'key', key, 'scope', scope, 'platform', platform, 'form_factor', form_factor,
    'host_name', host_name, 'value_json', value_json
  ) AS payload_json FROM setting_records
    WHERE scope || ':' || platform || ':' || form_factor || ':' || host_name || ':' || key = ?`,
  watched_folder: `SELECT json_object(
    'binding_id', b.binding_id, 'host_name', s.host_name, 'host_platform', s.host_platform,
    'owner_device_identity_key', b.owner_device_identity_key,
    'connection_status', b.connection_status, 'action_mode', b.action_mode,
    'highlight_mode', b.highlight_mode, 'reported_path', b.reported_path,
    'created_at', b.created_at, 'updated_at', b.updated_at, 'source_ref', b.source_ref
  ) AS payload_json FROM watched_folder_bindings b
    JOIN desktop_sources s ON s.source_ref = b.source_ref WHERE b.binding_id = ?`
} as const;
