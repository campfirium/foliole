import type { NodeVersionBodyStorage } from '../sync/syncNodeTombstoneVersion.js';

import { ANDROID_COMPANION_RESOURCE_STATUSES } from './androidCompanionSyncProtocolDefinitions.js';
import { VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

const RESOURCE_STATUS = ANDROID_COMPANION_RESOURCE_STATUSES;

function bodyStorageJoin(bodyStorage: NodeVersionBodyStorage) {
  return bodyStorage === 'chunked'
    ? 'LEFT JOIN content_bodies cbd ON cbd.hash = cb.hash AND cbd.verified = 1 '
    : 'LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash ';
}

function missingHashes(bodyStorage: NodeVersionBodyStorage) {
  const bodyJoin = bodyStorageJoin(bodyStorage);
  return {
    resultKey: 'blobs',
    sql:
      `${VISIBLE_NODES_CTE_SQL}, body_refs AS (` +
      'SELECT n.body_blob_hash AS hash, ' +
      "CASE WHEN n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) THEN 0 " +
      "WHEN nr.due IS NOT NULL AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 " +
      'WHEN n.parent_id IS NULL THEN 2 ELSE 3 END AS priority, ' +
      'COALESCE(rd.last_handled_at, n.updated_at) AS updated_at ' +
      'FROM nodes n INNER JOIN visible_nodes visible ON visible.id = n.id ' +
      'LEFT JOIN node_review nr ON nr.node_id = n.id ' +
      'LEFT JOIN node_reading rd ON rd.node_id = n.id ' +
      'WHERE n.body_blob_hash IS NOT NULL ' +
      'UNION ALL SELECT ed.body_blob_hash AS hash, 4 AS priority, ed.updated_at AS updated_at ' +
      'FROM external_documents ed WHERE ed.body_blob_hash IS NOT NULL AND ed.is_present = 1 ' +
      "UNION ALL SELECT cb.hash, 5 AS priority, cb.created_at AS updated_at FROM content_blobs cb WHERE cb.kind = 'text_body'" +
      '), ranked_refs AS (' +
      'SELECT hash, MIN(priority) AS priority, MAX(updated_at) AS updated_at FROM body_refs GROUP BY hash' +
      ') SELECT cb.hash, COALESCE(cb.stored_size_bytes, 0) AS size_bytes FROM content_blobs cb ' +
      'JOIN ranked_refs refs ON refs.hash = cb.hash ' + bodyJoin +
      "WHERE cb.kind = 'text_body' AND cbd.hash IS NULL " +
      "ORDER BY CASE WHEN refs.priority = 0 THEN 0 WHEN cb.availability = '" +
      RESOURCE_STATUS.failed +
      "' THEN 2 ELSE 1 END ASC, " +
      'refs.priority ASC, refs.updated_at DESC, cb.created_at ASC LIMIT ?',
    columns: [
      { key: 'hash', source: 'hash', type: 'string' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' }
    ]
  };
}

function missingSummary(bodyStorage: NodeVersionBodyStorage) {
  const bodyJoin = bodyStorageJoin(bodyStorage);
  return {
    resultKey: 'blobs',
    sql:
      `${VISIBLE_NODES_CTE_SQL}, body_refs AS (` +
      'SELECT n.body_blob_hash AS hash FROM nodes n INNER JOIN visible_nodes visible ON visible.id = n.id WHERE n.body_blob_hash IS NOT NULL ' +
      'UNION SELECT ed.body_blob_hash AS hash FROM external_documents ed ' +
      'WHERE ed.body_blob_hash IS NOT NULL AND ed.is_present = 1 ' +
      "UNION SELECT cb.hash FROM content_blobs cb WHERE cb.kind = 'text_body'" +
      ') SELECT cb.hash, COALESCE(cb.stored_size_bytes, 0) AS size_bytes, cb.availability FROM content_blobs cb ' +
      'JOIN body_refs refs ON refs.hash = cb.hash ' + bodyJoin +
      "WHERE cb.kind = 'text_body' AND cbd.hash IS NULL",
    columns: [
      { key: 'hash', source: 'hash', type: 'string' },
      { key: 'size_bytes', source: 'size_bytes', type: 'long' },
      { key: 'availability', source: 'availability', type: 'string' }
    ]
  };
}

function contentResourceQueries(bodyStorage: NodeVersionBodyStorage) {
  return {
    contentBlobMissingHashes: missingHashes(bodyStorage),
    contentBlobMissingSummaryRows: missingSummary(bodyStorage),
    contentBlobManifestByHash: {
      resultKey: 'blobs',
      sql:
        'SELECT compression, original_size_bytes, stored_size_bytes, original_sha256, stored_sha256 ' +
        'FROM content_blobs WHERE hash = ? LIMIT 1',
      columns: [
        { key: 'compression', source: 'compression', type: 'string' },
        { key: 'original_size_bytes', source: 'original_size_bytes', type: 'long' },
        { key: 'stored_size_bytes', source: 'stored_size_bytes', type: 'long' },
        { key: 'original_sha256', source: 'original_sha256', type: 'string' },
        { key: 'stored_sha256', source: 'stored_sha256', type: 'string' }
      ]
    },
    contentBlobDataExisting: {
      resultKey: 'blobs',
      sql: bodyStorage === 'chunked'
        ? 'SELECT hash FROM content_bodies WHERE hash = ? AND verified = 1 LIMIT 1'
        : 'SELECT hash FROM content_blob_data WHERE hash = ? LIMIT 1',
      columns: [{ key: 'hash', source: 'hash', type: 'string' }]
    },
    contentBlobManifestsByHashes: {
      resultKey: 'blobs',
      sql:
        'SELECT hash, compression, original_size_bytes, stored_size_bytes, original_sha256, stored_sha256 ' +
        'FROM content_blobs WHERE hash IN (__HASH_FILTER__)',
      columns: [
        { key: 'hash', source: 'hash', type: 'string' },
        { key: 'compression', source: 'compression', type: 'string' },
        { key: 'original_size_bytes', source: 'original_size_bytes', type: 'long' },
        { key: 'stored_size_bytes', source: 'stored_size_bytes', type: 'long' },
        { key: 'original_sha256', source: 'original_sha256', type: 'string' },
        { key: 'stored_sha256', source: 'stored_sha256', type: 'string' }
      ]
    }
  };
}

export const ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS = contentResourceQueries('continuous');

export function companionContentResourceQueryDefinition(
  name: keyof typeof ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS,
  bodyStorage: NodeVersionBodyStorage = 'continuous'
) {
  return contentResourceQueries(bodyStorage)[name];
}
