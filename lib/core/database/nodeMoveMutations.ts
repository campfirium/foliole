import type { NativeMoveNodePatch, NativeMoveNodesArgs, NativeMoveNodesResult } from '../../platform/nativeMoveContract.js';

import type { DatabaseDriver } from './driver.js';
import { captureMoveReadingScope, loadMoveReadingContext } from './nodeMoveReadingContext.js';
import { maintainMoveReading } from './nodeMoveReadingMaintenance.js';
import { readMoveParentOrder, validateMoveStructure, writeMoveStructure } from './nodeMoveStructure.js';
import { enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds } from './searchIndexInvalidations.js';

export type MoveNodesInput = NativeMoveNodesArgs;
export type MoveNodesResult = NativeMoveNodesResult;
export type MoveNodePatchInput = NativeMoveNodePatch;

/** Coordinates independent structure and reading owners inside the existing transaction. */
export function moveNodes(driver: DatabaseDriver, input: MoveNodesInput): MoveNodesResult {
  return driver.transaction(() => {
    const structure = validateMoveStructure(driver, input);
    const needsReading = input.maintainSequentialReading ||
      input.nodes.some((node) => node.expectedParentNodeId !== node.parentNodeId);
    const scope = needsReading ? captureMoveReadingScope(driver, input) : null;
    const beforeReading = scope ? loadMoveReadingContext(driver, scope) : null;
    writeMoveStructure(driver, input, structure);
    const parentOrders = input.parentOrders.map(({ parentNodeId }) => ({ parentNodeId,
      childIds: readMoveParentOrder(driver, parentNodeId).visibleIds }));
    const readings = scope && beforeReading ? maintainMoveReading(driver, input, scope, beforeReading) : [];
    const changedRoots = input.nodes.filter((node) => node.expectedParentNodeId !== node.parentNodeId);
    enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(driver, changedRoots.map((node) => node.nodeId));
    const nodes = driver.queryAll<{ id: string; parent_id: string | null; updated_at: string }>(
      'SELECT id, parent_id, updated_at FROM nodes WHERE id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(input.nodes.map((node) => node.nodeId))]).map((row) =>
      ({ nodeId: row.id, parentNodeId: row.parent_id, updatedAt: row.updated_at }));
    return { movedNodeIds: nodes.map((node) => node.nodeId), parentOrders, nodes, readings };
  });
}
