import { isNodeKind, type NodeKind } from '../nodes/nodeKind.js';
import { parseVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { parseStoredImageRegions } from './imageRegionCodec.js';
import { resolveNodeBody, type NodeBodyRow } from './nodeBodyResolution.js';

interface WorkspaceNodeDocumentRow extends DatabaseRow, NodeBodyRow {
  hide_title_heading: number;
  id: string;
  kind: string | null;
  reveal: string | null;
  image_regions: string | null;
  virtual_filter: string | null;
  updated_at: string;
}

function parseNodeKind(value: string | null): NodeKind {
  return isNodeKind(value) ? value : 'topic';
}

export function loadWorkspaceNodeDocument(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<WorkspaceNodeDocumentRow>(
    `SELECT n.id, n.kind, n.content, n.body_blob_hash, cbd.data AS body_blob_data, n.reveal,
       n.hide_title_heading, n.image_regions, n.virtual_filter, n.updated_at
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`,
    [nodeId]
  );
  if (!row) {
    return null;
  }
  const body = resolveNodeBody(row);
  if (body.status === 'unavailable') return null;
  const imageRegions = parseStoredImageRegions(row.image_regions);
  return {
    nodeId: row.id,
    kind: parseNodeKind(row.kind),
    content: body.content,
    hideTitleHeading: row.hide_title_heading === 1,
    ...(imageRegions ? { imageRegions } : {}),
    virtualFilter: parseVirtualNodeFilter(row.virtual_filter),
    reveal: row.reveal,
    updatedAt: row.updated_at
  };
}
