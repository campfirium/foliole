import type { DatabaseDriver } from './driver.js';

const SPECIAL_ROOT_NODE_RECORDS = {
  'special-inbox': { title: 'Inbox' },
  'special-virtual-root': { title: 'Virtual' }
} as const;

type SpecialRootNodeId = keyof typeof SPECIAL_ROOT_NODE_RECORDS;

function isSpecialRootNode(nodeId: string): nodeId is SpecialRootNodeId {
  return nodeId in SPECIAL_ROOT_NODE_RECORDS;
}

function ensureSpecialRootNode(driver: DatabaseDriver, nodeId: SpecialRootNodeId, updatedAt: string) {
  const existingNode = driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = ?', [nodeId]);
  if (existingNode) {
    return;
  }
  driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, virtual_filter, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, 'folder', NULL, NULL, ?, 1, 0, '', NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
    [nodeId, SPECIAL_ROOT_NODE_RECORDS[nodeId].title, updatedAt, updatedAt]
  );
}

export function ensureSpecialRootNodesForInput(
  driver: DatabaseDriver,
  input: { nodeId: string; parentNodeId: string | null; updatedAt: string }
) {
  if (isSpecialRootNode(input.nodeId)) {
    ensureSpecialRootNode(driver, input.nodeId, input.updatedAt);
  }
  if (input.parentNodeId && isSpecialRootNode(input.parentNodeId)) {
    ensureSpecialRootNode(driver, input.parentNodeId, input.updatedAt);
  }
}

export function ensureSpecialRootNodesForOrder(driver: DatabaseDriver, nodeIds: string[]) {
  const updatedAt = new Date().toISOString();
  for (const nodeId of nodeIds) {
    if (isSpecialRootNode(nodeId)) {
      ensureSpecialRootNode(driver, nodeId, updatedAt);
    }
  }
}
