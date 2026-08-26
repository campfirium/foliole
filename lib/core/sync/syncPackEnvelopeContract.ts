import { DEVICE_IDENTITY_BUSINESS_PAYLOAD_KEYS } from '../../platform/syncGroupDeviceContentBoundary.js';

import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';
import {
  SYNC_PACK_LEGACY_OPTIONAL_NODE_COLUMNS,
  SYNC_PACK_NODE_COLUMNS
} from './syncPackNodeFields.js';

export const SYNC_PACK_FORMAT = 'foliole.sync-pack';
export const SYNC_PACK_FORMAT_VERSION = 12;
export const SYNC_PACK_PAYLOAD_SCHEMA_VERSION = 77;
export const SYNC_PACK_COMPRESSION = 'zlib';
export const SYNC_PACK_DATABASE_ENTRY = 'incoming.db.deflate';
export const SYNC_PACK_MINIMUM_SCHEMA_VERSION = SYNC_PACK_PAYLOAD_SCHEMA_VERSION;

export function assertSyncPackSchemaVersion(value: unknown) {
  if (value !== SYNC_PACK_PAYLOAD_SCHEMA_VERSION) {
    throw new Error('unsupported_sync_pack_schema_version');
  }
}

const requiredNodeColumns = SYNC_PACK_NODE_COLUMNS.filter(
  (column) => !SYNC_PACK_LEGACY_OPTIONAL_NODE_COLUMNS.has(column)
);

export const SYNC_PACK_SQLITE_TABLE_REQUIREMENTS = {
  pack_manifest: ['key', 'value'],
  sync_groups: ['group_id', 'display_name', 'timeline_id', 'created_by_host_name', 'created_at'],
  sync_group_members: [
    'group_id', 'host_name', 'host_platform', 'state', 'approved_by_host_name',
    'authorization_id', 'joined_at', 'left_at', 'updated_at'
  ],
  sync_group_member_departures: [
    'group_id', 'host_name', 'authorized_by_host_name', 'authorization_id', 'left_at'
  ],
  sync_object_state: [
    'object_type', 'object_id', 'state_seq', 'content_hash', 'last_modified_by_host_name', 'updated_at', 'deleted_at'
  ],
  sync_objects: ['object_type', 'object_id', 'content_hash', 'payload_json', 'updated_at', 'deleted_at'],
  nodes: requiredNodeColumns,
  node_sync_versions: [
    'version_id', 'object_id', 'parent_version_id', 'host_name',
    'created_at', 'content_hash', 'body_text', 'snapshot_json'
  ],
  node_sync_version_parents: ['version_id', 'parent_version_id', 'ordinal'],
  node_order: ['node_id', 'position'],
  node_attachments: ['node_id', 'attachment_id', 'role'],
  external_documents: [
    'document_id', 'folder_id', 'relative_path', 'file_name', 'extension', 'source_size_bytes',
    'source_modified_at', 'source_modified_ms', 'content_hash', 'title', 'opening_text',
    'body_blob_hash', 'content', 'indexed_at', 'is_present', 'missing_at', 'created_at', 'updated_at'
  ],
  content_blobs: [
    'hash', 'storage_key', 'kind', 'mime_type', 'compression', 'original_size_bytes',
    'stored_size_bytes', 'original_sha256', 'stored_sha256', 'availability', 'source_host_name',
    'created_at', 'cached_at', 'last_verified_at'
  ],
  review_log: [
    'id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version', 'reviewed_at',
    'due_before', 'stability_before', 'difficulty_before', 'due_after', 'stability_after', 'difficulty_after'
  ]
} as const;

export const SYNC_PACK_ENVELOPE_CONTRACT = {
  compression: SYNC_PACK_COMPRESSION,
  databaseEntry: SYNC_PACK_DATABASE_ENTRY,
  format: SYNC_PACK_FORMAT,
  formatVersion: SYNC_PACK_FORMAT_VERSION,
  forbiddenDeviceIdentityKeys: DEVICE_IDENTITY_BUSINESS_PAYLOAD_KEYS,
  legacyOptionalNodeColumns: [...SYNC_PACK_LEGACY_OPTIONAL_NODE_COLUMNS],
  manifestTableNames: SYNC_PACK_TABLE_NAMES,
  maximumSchemaVersion: SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
  minimumSchemaVersion: SYNC_PACK_MINIMUM_SCHEMA_VERSION,
  sqliteTableRequirements: SYNC_PACK_SQLITE_TABLE_REQUIREMENTS
} as const;
