import { decodeTextBodyBlobData } from './contentBodyBlobs.js';
import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { loadVerifiedBodyRefWithDriver, readBodyTextWithDriver } from './verifiedBodyWithDriver.js';

export { buildNodeBodyContentSql } from './nodeBodySql.js';

export interface NodeBodyRow extends DatabaseRow {
  body_blob_data: unknown;
  body_blob_hash: string | null;
  content: string;
}

export type NodeBodyResolution =
  | { bodyBlobHash: string; content: string; source: 'blob'; status: 'resolved' }
  | { bodyBlobHash: null; content: string; source: 'legacy_inline'; status: 'resolved' }
  | { bodyBlobHash: string; status: 'unavailable' };

export class NodeBodyUnavailableError extends Error {
  readonly nodeIds: string[];

  constructor(nodeIds: string[]) {
    super(`node_body_unavailable:${nodeIds.join(',')}`);
    this.name = 'NodeBodyUnavailableError';
    this.nodeIds = nodeIds;
  }
}

export function resolveNodeBody(row: NodeBodyRow): NodeBodyResolution {
  const bodyBlobHash = row.body_blob_hash?.trim() || null;
  if (!bodyBlobHash) {
    return { bodyBlobHash: null, content: row.content, source: 'legacy_inline', status: 'resolved' };
  }
  const content = decodeTextBodyBlobData(row.body_blob_data);
  return content === null
    ? { bodyBlobHash, status: 'unavailable' }
    : { bodyBlobHash, content, source: 'blob', status: 'resolved' };
}

export function requireResolvedNodeBody(row: NodeBodyRow, nodeId: string) {
  const resolution = resolveNodeBody(row);
  if (resolution.status === 'unavailable') {
    throw new NodeBodyUnavailableError([nodeId]);
  }
  return resolution;
}

/** Single-article editor/background reads only; ordinary sync applies stable references. */
export function loadNodeBodyResolution(driver: DatabaseDriver, nodeId: string, storage: 'continuous' | 'chunked' = 'continuous') {
  if (storage === 'chunked') return loadChunkedNodeBody(driver, nodeId);
  const row = driver.queryOne<NodeBodyRow>(
    `SELECT n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`,
    [nodeId]
  );
  return row ? resolveNodeBody(row) : null;
}

function loadChunkedNodeBody(driver: DatabaseDriver, nodeId: string): NodeBodyResolution | null {
  const row = driver.queryOne<{ body_blob_hash: string | null }>('SELECT body_blob_hash FROM nodes WHERE id = ?', [nodeId]);
  if (!row) return null;
  const hash = row.body_blob_hash?.trim();
  if (!hash) throw new NodeBodyUnavailableError([nodeId]);
  const ref = loadVerifiedBodyRefWithDriver(driver, hash);
  return ref ? { bodyBlobHash: hash, content: readBodyTextWithDriver(driver, ref), source: 'blob', status: 'resolved' }
    : { bodyBlobHash: hash, status: 'unavailable' };
}
