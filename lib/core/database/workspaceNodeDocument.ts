import { isNodeKind, type NodeKind } from '../nodes/nodeKind.js';
import { parseVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { parseStoredImageRegions } from './imageRegionCodec.js';

interface WorkspaceNodeDocumentRow extends DatabaseRow {
  content: string;
  hide_title_heading: number;
  id: string;
  kind: string | null;
  reveal: string | null;
  image_regions: string | null;
  virtual_filter: string | null;
}

function parseNodeKind(value: string | null): NodeKind {
  return isNodeKind(value) ? value : 'topic';
}

export function loadWorkspaceNodeDocument(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<WorkspaceNodeDocumentRow>(
    `SELECT id, kind, content, reveal, hide_title_heading, image_regions, virtual_filter
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
  if (!row) {
    return null;
  }
  const imageRegions = parseStoredImageRegions(row.image_regions);
  return {
    nodeId: row.id,
    kind: parseNodeKind(row.kind),
    content: row.content,
    hideTitleHeading: row.hide_title_heading === 1,
    ...(imageRegions ? { imageRegions } : {}),
    virtualFilter: parseVirtualNodeFilter(row.virtual_filter),
    reveal: row.reveal
  };
}
