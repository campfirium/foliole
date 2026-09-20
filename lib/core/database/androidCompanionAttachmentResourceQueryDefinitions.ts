import { attachmentStorageKeySql } from './attachmentMetadataSql.js';

const storageKey = attachmentStorageKeySql('a.id', 'a.mime_type');
const resourceRow = `SELECT a.id AS attachment_id, a.id AS content_hash, COALESCE(a.size_bytes, 0) AS size_bytes,
  'unresolved' AS availability, ${storageKey} AS storage_key, a.mime_type FROM attachments a`;

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
    sql: `${resourceRow} WHERE a.id = ? LIMIT 1`,
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
    sql: `SELECT ${storageKey} AS storage_key, a.mime_type FROM attachments a WHERE a.id = ? LIMIT 1`,
    columns: [
      { key: 'storage_key', source: 'storage_key', type: 'nullableString' },
      { key: 'mime_type', source: 'mime_type', type: 'nullableString' }
    ]
  },
  attachmentResourceContentHashesByIds: {
    resultKey: 'resources',
    sql: 'SELECT id AS attachment_id, id AS content_hash FROM attachments WHERE id IN (__ATTACHMENT_ID_FILTER__)',
    columns: [
      { key: 'attachment_id', source: 'attachment_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' }
    ]
  }
};
