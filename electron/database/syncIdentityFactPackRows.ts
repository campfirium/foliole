import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { syncIdentityFingerprint } from '../../lib/core/sync/syncIdentityDigest.js';
import { encodeIdentityFactChunk, SYNC_IDENTITY_FACT_CHUNK_BYTES } from '../../lib/core/sync/syncIdentityFactChunk.js';
import { syncIdentityFactChunkSourceQueries } from '../../lib/core/sync/syncIdentityFactChunkSource.js';
import { boundSyncIdentityFactRows, selectSyncIdentityFactRowCount, syncIdentityFactSourceQuery } from '../../lib/core/sync/syncIdentityFactSourceRows.js';
import type { SyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import type { SyncPackNodeVersionParentRow, SyncPackNodeVersionRow } from '../../lib/core/sync/syncPackNodeVersions.js';

import type { WritableDesktopSyncPackRows } from './syncPackLoadedRows.js';
import type { ReviewLogPackRow, SyncStatePackRow } from './syncPackRows.js';

/** Read exactly one section page without loading the node's complete history. */
export function loadSyncIdentityFactPackRows(driver: DatabaseDriver, page: SyncIdentityPackPage) {
  const facts = page.facts;
  const object = page.objects[0];
  if (!facts || facts.section === 'head' || !object) throw new Error('sync_identity_fact_request_invalid');
  const state = driver.queryOne<SyncStatePackRow>(`SELECT * FROM sync_object_state
    WHERE object_type = 'node' AND object_id = ?`, [object.object_id]);
  const indexed = driver.queryOne<{ digest: string }>(
    'SELECT digest FROM sync_identity_node_facts WHERE node_id = ?', [object.object_id]);
  if (!state || syncIdentityFingerprint(state) !== object.fingerprint || indexed?.digest !== facts.digest) {
    throw new Error('sync_identity_pack_source_changed');
  }
  const rows: WritableDesktopSyncPackRows = { nodes: [], stateRows: [{ ...state, state_seq: 0 }],
    syncObjects: [], externalDocuments: [], contentBlobs: [], reviewLog: [], nodeVersions: [],
    nodeVersionParents: [], nodeTombstones: [], groupDevices: [], groups: [], nodeVersionDependencies: [] };
  const query = syncIdentityFactSourceQuery(object.object_id, facts);
  const lengths = driver.queryAll<{ payload_bytes: number }>(query.lengthsSql, query.params);
  if (facts.chunk || (lengths[0]?.payload_bytes ?? 0) > SYNC_IDENTITY_FACT_CHUNK_BYTES) {
    const chunk = loadChunk(driver, object.object_id, facts, lengths.length > 1);
    return { rows, ...chunk };
  }
  const giantIndex = lengths.findIndex((row) => row.payload_bytes > SYNC_IDENTITY_FACT_CHUNK_BYTES);
  const count = selectSyncIdentityFactRowCount(giantIndex < 0 ? lengths : lengths.slice(0, giantIndex), facts.limit);
  query.params[query.params.length - 1] = count;
  const hasMore = lengths.length > count;
  if (facts.section === 'versions') {
    const result = boundSyncIdentityFactRows(driver.queryAll<SyncPackNodeVersionRow>(query.sql, query.params), facts, hasMore);
    rows.nodeVersions = result.rows;
    return { rows, tail: result.tail, chunk: undefined };
  }
  if (facts.section === 'parents') {
    const result = boundSyncIdentityFactRows(driver.queryAll<SyncPackNodeVersionParentRow>(query.sql, query.params), facts, hasMore);
    rows.nodeVersionParents = result.rows;
    return { rows, tail: result.tail, chunk: undefined };
  }
  const result = boundSyncIdentityFactRows(driver.queryAll<ReviewLogPackRow>(query.sql, query.params), facts, hasMore);
  rows.reviewLog = result.rows;
  return { rows, tail: result.tail, chunk: undefined };
}

function loadChunk(driver: DatabaseDriver, nodeId: string,
  facts: NonNullable<SyncIdentityPackPage['facts']>, hasMore: boolean) {
  const query = syncIdentityFactChunkSourceQueries(nodeId, facts);
  const row = driver.queryOne<{ fact_key: string; total: number }>(query.metadataSql, query.params);
  const offset = facts.chunk?.offset ?? 0;
  if (!row || offset >= row.total || facts.chunk &&
      (facts.chunk.key !== row.fact_key || facts.chunk.total !== row.total)) {
    throw new Error('sync_identity_fact_chunk_source_mismatch');
  }
  const bytes = driver.queryOne<{ data: Uint8Array }>(query.chunkSql, query.chunkParams)?.data;
  if (!(bytes instanceof Uint8Array) || bytes.length !== Math.min(SYNC_IDENTITY_FACT_CHUNK_BYTES, row.total - offset)) {
    throw new Error('sync_identity_fact_chunk_source_mismatch');
  }
  const chunk = { key: row.fact_key, offset, total: row.total };
  const nextOffset = offset + bytes.length;
  return { chunk: { ...chunk, data_base64: encodeIdentityFactChunk(bytes) },
    tail: nextOffset < row.total ? { nextAfter: facts.after,
      chunk: { key: chunk.key, nextOffset, total: chunk.total } } :
      { nextAfter: hasMore ? chunk.key : null } };
}
