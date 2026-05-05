import { isNodeKind, type NodeKind } from '../nodes/nodeKind.js';
import { parseVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface WorkspaceNodeDocumentRow extends DatabaseRow {
  content: string;
  hide_title_heading: number;
  id: string;
  kind: string | null;
  reveal: string | null;
  virtual_filter: string | null;
}

function parseNodeKind(value: string | null): NodeKind {
  return isNodeKind(value) ? value : 'topic';
}

export function loadWorkspaceNodeDocument(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<WorkspaceNodeDocumentRow>(
    `SELECT id, kind, content, reveal, hide_title_heading, virtual_filter
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
  if (!row) {
    return null;
  }
  return {
    nodeId: row.id,
    kind: parseNodeKind(row.kind),
    content: row.content,
    hideTitleHeading: row.hide_title_heading === 1,
    virtualFilter: parseVirtualNodeFilter(row.virtual_filter),
    reveal: row.reveal
  };
}
