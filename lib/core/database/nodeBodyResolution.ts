import { decodeTextBodyBlobData } from './contentBodyBlobs.js';
import type { DatabaseDriver, DatabaseRow } from './driver.js';

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

export function buildNodeBodyContentSql(nodeAlias = 'n', dataAlias = 'cbd') {
  return `CASE
    WHEN NULLIF(TRIM(${nodeAlias}.body_blob_hash), '') IS NULL THEN ${nodeAlias}.content
    WHEN ${dataAlias}.hash IS NOT NULL THEN CAST(${dataAlias}.data AS TEXT)
    ELSE ''
  END`;
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

export function loadNodeBodyResolution(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<NodeBodyRow>(
    `SELECT n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`,
    [nodeId]
  );
  return row ? resolveNodeBody(row) : null;
}
