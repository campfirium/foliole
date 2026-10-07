import { isNodeKind, type NodeKind } from '../nodes/nodeKind.js';
import { parseVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { parseStoredImageRegions } from './imageRegionCodec.js';
import { parseImageSources } from './imageSources.js';
import { resolveNodeBody, type NodeBodyRow } from './nodeBodyResolution.js';
import { loadNodeConsumerBody } from './nodeConsumerBodyResolution.js';

interface WorkspaceNodeDocumentRow extends DatabaseRow, NodeBodyRow {
  hide_title_heading: number;
  id: string;
  current_version_id: string | null;
  kind: string | null;
  reveal: string | null;
  image_regions: string | null;
  image_sources?: string | null;
  virtual_filter: string | null;
  updated_at: string;
}

function parseNodeKind(value: string | null): NodeKind {
  return isNodeKind(value) ? value : 'topic';
}

export function loadWorkspaceNodeDocument(driver: DatabaseDriver, nodeId: string, storage: 'continuous' | 'chunked' = 'continuous') {
  const row = driver.queryOne<WorkspaceNodeDocumentRow>(
    `SELECT n.id, n.kind, ${storage === 'continuous' ? 'n.content, n.body_blob_hash, cbd.data AS body_blob_data' : "'' AS content, n.body_blob_hash, NULL AS body_blob_data"}, n.reveal,
       n.current_version_id,
       n.hide_title_heading, n.image_regions, n.image_sources, n.virtual_filter, n.updated_at
     FROM nodes n
     ${storage === 'continuous' ? 'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash' : ''}
     WHERE n.id = ?`,
    [nodeId]
  );
  if (!row) {
    return null;
  }
  const body = storage === 'continuous' ? resolveNodeBody(row) : loadNodeConsumerBody(driver, nodeId, storage);
  if (!body) return null;
  if (body.status === 'unavailable') return null;
  const imageRegions = parseStoredImageRegions(row.image_regions);
  return {
    nodeId: row.id,
    imageSources: parseImageSources(row.image_sources),
    kind: parseNodeKind(row.kind),
    content: body.content,
    currentVersionId: row.current_version_id,
    hideTitleHeading: row.hide_title_heading === 1,
    ...(imageRegions ? { imageRegions } : {}),
    virtualFilter: parseVirtualNodeFilter(row.virtual_filter),
    reveal: row.reveal,
    updatedAt: row.updated_at
  };
}
