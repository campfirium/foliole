import { SYNC_IDENTITY_FACT_CHUNK_BYTES } from './syncIdentityFactChunk.js';
import { syncIdentityFactSourceQuery } from './syncIdentityFactSourceRows.js';
import type { SyncIdentityFactTransfer } from './syncIdentityFactTransfer.js';

/** Native/desktop storage adapters return only fixed-size original JSON byte slices. */
export function syncIdentityFactChunkSourceQueries(nodeId: string, facts: SyncIdentityFactTransfer,
  schema = 'main') {
  const query = syncIdentityFactSourceQuery(nodeId, { ...facts, limit: 1 }, schema);
  const key = facts.section === 'parents' ? 'json_array(version_id, ordinal, parent_version_id)' :
    facts.section === 'reviews' ? 'op_id' : 'version_id';
  const json = `json_object(${query.columns.flatMap((column) => [`'${column}'`, column]).join(', ')})`;
  const source = `FROM (${query.sql}) original`;
  return {
    metadataSql: `SELECT ${key} AS fact_key, length(CAST(${json} AS BLOB)) AS total ${source} LIMIT 1`,
    chunkSql: `SELECT substr(CAST(${json} AS BLOB), ?, ?) AS data ${source} LIMIT 1`,
    params: query.params,
    chunkParams: [facts.chunk?.offset ? facts.chunk.offset + 1 : 1,
      SYNC_IDENTITY_FACT_CHUNK_BYTES, ...query.params]
  };
}
