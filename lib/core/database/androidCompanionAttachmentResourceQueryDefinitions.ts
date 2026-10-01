import { NODE_RESOURCES_SQL } from './nodeResourcesSql.js';

const resourceRow = `SELECT * FROM (${NODE_RESOURCES_SQL}) resource`;

export const ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS = {
  attachmentResourceMissingRows: {
    resultKey: 'resources',
    sql: `${resourceRow} WHERE 0`,
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' },
      { key: 'availability', source: 'availability', type: 'string' },
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' },
      { key: 'mime_type', source: 'mime_type', type: 'nullableString' }
    ]
  },
  attachmentResourceMissingSummaryRows: {
    resultKey: 'resources',
    sql: `SELECT 'unresolved' AS availability, NULL AS storage_key, 0 AS size_bytes,
      '' AS mime_type, 0 AS due_review, 0 AS active_topic WHERE 0`,
    columns: [
      { key: 'availability', source: 'availability', type: 'string' },
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' },
      { key: 'mime_type', source: 'mime_type', type: 'string' },
      { key: 'due_review', source: 'due_review', type: 'long' },
      { key: 'active_topic', source: 'active_topic', type: 'long' }
    ]
  },
  attachmentResourceMissingById: {
    resultKey: 'resources',
    sql: `${resourceRow} WHERE attachment_id = ? LIMIT 1`,
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' },
      { key: 'availability', source: 'availability', type: 'string' },
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' },
      { key: 'mime_type', source: 'mime_type', type: 'nullableString' }
    ]
  },
  attachmentResourceResolve: {
    resultKey: 'resources',
    sql: `${resourceRow} WHERE attachment_id = ? LIMIT 1`,
    columns: [
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' },
      { key: 'mime_type', source: 'mime_type', type: 'nullableString' }
    ]
  },
  attachmentResourceContentHashesByIds: {
    resultKey: 'resources',
    sql: `${resourceRow} WHERE attachment_id IN (__ATTACHMENT_ID_FILTER__)`,
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' }
    ]
  }
};
