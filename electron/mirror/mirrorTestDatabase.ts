import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import type { NativeMoveNodesArgs } from '../../lib/platform/nativeMoveContract.js';
import { openDatabaseConnection } from '../database/connection.js';

export function resetMirrorTestWorkspace() {
  openDatabaseConnection().sqlite.exec(`
    DELETE FROM mirror_articles;
    DELETE FROM incoming_updates;
    DELETE FROM node_reading;
    DELETE FROM node_review;
    DELETE FROM parent_child_order;
    DELETE FROM workspace_meta;
    DELETE FROM nodes;
  `);
}

export function createMirrorTestMoveInput(nodeId: string, parentNodeId: string | null): NativeMoveNodesArgs {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<{ parent_id: string | null }>('SELECT parent_id FROM nodes WHERE id = ?', [nodeId]);
  if (!row) throw new Error('Mirror move fixture node is missing');
  const expectedParentNodeId = row.parent_id;
  const parentOrders = [...new Set([expectedParentNodeId, parentNodeId])].map((parent) => {
    const expectedChildIds = readMoveParentOrder(driver, parent).visibleIds;
    const childIds = expectedChildIds.filter((id) => id !== nodeId);
    if (parent === parentNodeId) childIds.push(nodeId);
    return { parentNodeId: parent, expectedChildIds, childIds };
  });
  return { nodes: [{ nodeId, expectedParentNodeId, parentNodeId, updatedAt: '2030-10-06T00:01:00.000Z' }],
    parentOrders, maintainSequentialReading: false, defaultPriority: 5 };
}
