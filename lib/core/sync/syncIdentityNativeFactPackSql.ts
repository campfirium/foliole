import { IDENTITY_REVIEW_COLUMNS } from './syncIdentityFactSourceRows.js';
import { SYNC_PACK_NODE_VERSION_COLUMNS } from './syncPackNodeVersions.js';

function factPlan(section: string, table: string, columns: readonly string[], owner: string,
  key: string, order: string, after: string) {
  const json = `json_object(${columns.flatMap((column) => [`'${column}'`, column]).join(', ')})`;
  const candidates = `SELECT rowid AS source_rowid, ${order}, ${key} AS fact_key,
    length(CAST(${json} AS BLOB)) AS payload_bytes FROM source.${table}
    WHERE ${owner} AND ((SELECT after_key FROM selected_identity_fact) IS NULL OR ${after})
    ORDER BY ${order} LIMIT (SELECT MIN(page_limit + 1, 65) FROM selected_identity_fact)`;
  const tuple = (alias: string) => `(${order.split(', ').map((column) => `${alias}.${column}`).join(', ')})`;
  const earlier = `${tuple('earlier')} <= ${tuple('candidate')}`;
  const bounded = `WITH candidates AS (${candidates}), sized AS (SELECT candidate.*,
    (SELECT SUM(payload_bytes) FROM candidates earlier WHERE ${earlier}) AS total_bytes,
    (SELECT COUNT(*) FROM candidates earlier WHERE ${earlier}) AS row_number,
    (SELECT MAX(payload_bytes) FROM candidates earlier WHERE ${earlier}) AS largest_row FROM candidates candidate)`;
  return { section,
    metadataSql: `SELECT fact_key, payload_bytes AS total,
      (SELECT COUNT(*) FROM (${candidates})) > 1 AS has_more FROM (${candidates}) LIMIT 1`,
    chunkSql: `SELECT substr(CAST(${json} AS BLOB),
      (SELECT chunk_offset + 1 FROM selected_identity_fact), 262144) AS data
      FROM source.${table} WHERE rowid = (SELECT source_rowid FROM (${candidates}) LIMIT 1)`,
    preflightSql: `SELECT COALESCE(MAX(payload_bytes), 0) AS payload_bytes FROM (${candidates})
      WHERE fact_key = (SELECT fact_key FROM (${candidates}) LIMIT 1)`,
    copySql: `${bounded} INSERT INTO ${table} (${columns.join(', ')})
      SELECT ${columns.map((column) => `fact.${column}`).join(', ')} FROM source.${table} fact
      JOIN sized ON sized.source_rowid = fact.rowid WHERE sized.total_bytes <= 2097152 AND sized.largest_row <= 262144
        AND sized.row_number <= (SELECT page_limit FROM selected_identity_fact) ORDER BY sized.row_number`,
    tailSql: `${bounded} SELECT CASE WHEN EXISTS (SELECT 1 FROM sized
      WHERE total_bytes > 2097152 OR largest_row > 262144 OR row_number > (SELECT page_limit FROM selected_identity_fact))
      THEN (SELECT fact_key FROM sized WHERE total_bytes <= 2097152 AND largest_row <= 262144
        AND row_number <= (SELECT page_limit FROM selected_identity_fact)
        ORDER BY row_number DESC LIMIT 1) ELSE NULL END AS next_after` };
}

export const SYNC_IDENTITY_NATIVE_FACT_PLANS = [
  factPlan('versions', 'node_sync_versions', SYNC_PACK_NODE_VERSION_COLUMNS,
    'object_id = (SELECT object_id FROM selected_identity_objects)', 'version_id', 'version_id',
    'version_id > (SELECT after_key FROM selected_identity_fact)'),
  factPlan('parents', 'node_sync_version_parents', ['version_id', 'parent_version_id', 'ordinal'],
    'version_id IN (SELECT version_id FROM source.node_sync_versions WHERE object_id = (SELECT object_id FROM selected_identity_objects))',
    'json_array(version_id, ordinal, parent_version_id)', 'version_id, ordinal, parent_version_id',
    `(version_id, ordinal, parent_version_id) >
      (SELECT json_extract(after_key, '$[0]'), json_extract(after_key, '$[1]'),
        json_extract(after_key, '$[2]') FROM selected_identity_fact)`),
  factPlan('reviews', 'review_log', IDENTITY_REVIEW_COLUMNS,
    'node_id = (SELECT object_id FROM selected_identity_objects)', 'op_id', 'op_id',
    'op_id > (SELECT after_key FROM selected_identity_fact)')
];

export const SYNC_IDENTITY_NATIVE_FACT_VALIDATE_SQL = `SELECT COUNT(*) AS matches
  FROM source.sync_identity_node_facts WHERE node_id =
    (SELECT object_id FROM selected_identity_objects) AND digest =
    (SELECT fact_digest FROM selected_identity_fact)
    AND (SELECT page_limit FROM selected_identity_fact) BETWEEN 1 AND 64
    AND (SELECT COUNT(*) FROM selected_identity_objects) = 1
    AND (SELECT object_type FROM selected_identity_objects) = 'node'`;

/** Head carries only structure; original target and parent versions arrive through fact sections. */
export const SYNC_IDENTITY_NATIVE_FACT_HEAD_COPY_SQL = `INSERT INTO node_sync_versions
  SELECT version_id, object_id, parent_version_id, host_name, created_at,
    content_hash, body_text, snapshot_json FROM source.node_sync_versions WHERE 0`;
