import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from './specialNodeIds.js';

const protectedSourceIds = [HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID];

export const DIVE_SOURCE_ELIGIBILITY_SQL = `SELECT 1 FROM nodes AS source LEFT JOIN nodes AS parent ON parent.id = source.parent_id
  WHERE source.id = ? AND source.deleted_at IS NULL AND source.virtual_filter IS NULL
  AND (source.kind = 'folder' OR (source.kind = 'topic'
    AND source.anchor_link IS NULL AND (source.parent_id IS NULL OR parent.kind = 'folder')))
  AND source.id NOT IN (?, ?, ?, ?) AND COALESCE(source.parent_id, '') <> ?`;

export function diveSourceEligibilityArgs(id: string) {
  return [id, ...protectedSourceIds, VIRTUAL_ROOT_NODE_ID];
}

export function canUseDiveSource(node: {
  id: string; kind: string; parentNodeId: string | null; deletedAt?: string | null;
  virtualFilter?: unknown; anchorLink?: unknown;
} | undefined, parentKind?: string) {
  if (!node || node.deletedAt || node.virtualFilter || protectedSourceIds.includes(node.id) ||
      node.parentNodeId === VIRTUAL_ROOT_NODE_ID) return false;
  return node.kind === 'folder' || (node.kind === 'topic' && !node.anchorLink &&
    (node.parentNodeId === null || parentKind === 'folder'));
}
