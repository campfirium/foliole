import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import type { NativeMoveNodePatch } from '../../lib/platform/nativeMoveContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { moveNodes } from '../database/nodeMutations.js';

import { createSuperMemoAnchorReparentPlanner, type ReparentedSuperMemoAnchor } from './superMemoAnchorReparent.js';

export interface SuperMemoDirectoryMove {
  nodeId: string;
  from: string | null;
  to: string | null;
  anchor?: ReparentedSuperMemoAnchor;
}

function verifyCreatedParentAnchors(moves: SuperMemoDirectoryMove[], createdParents: ReadonlySet<string>) {
  const { driver } = openDatabaseConnection();
  const planAnchor = createSuperMemoAnchorReparentPlanner(driver);
  if (!createdParents.size) return;
  for (const move of moves) {
    if (!move.anchor || !move.from || !move.to || !createdParents.has(move.to)) continue;
    const raw = driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id = ?', [move.nodeId]);
    const verified = raw?.anchor_link && planAnchor(raw.anchor_link, move.from, move.to);
    if (!verified || JSON.stringify(verified.link) !== JSON.stringify(move.anchor.link)) throw new Error('supermemo_update_changed');
    move.anchor = verified;
  }
}

function moveWithParentOrder(moves: SuperMemoDirectoryMove[], now: string) {
  const { driver } = openDatabaseConnection();
  const nodes: NativeMoveNodePatch[] = moves.map(move => ({
    nodeId: move.nodeId, expectedParentNodeId: move.from, parentNodeId: move.to, updatedAt: now
  }));
  const changed = new Set(nodes.map(node => node.nodeId));
  const parentOrders = [...new Set(moves.flatMap(move => [move.from, move.to]))].map(parentNodeId => {
    const expectedChildIds = readMoveParentOrder(driver, parentNodeId).visibleIds;
    return { parentNodeId, expectedChildIds, childIds: [
      ...expectedChildIds.filter(id => !changed.has(id)), ...moves.filter(move => move.to === parentNodeId).map(move => move.nodeId)
    ] };
  });
  moveNodes({ nodes, parentOrders, maintainSequentialReading: false, defaultPriority: 5 });
}

export function applySuperMemoDirectoryMoves(moves: SuperMemoDirectoryMove[], now: string, createdParents: ReadonlySet<string>) {
  const { driver } = openDatabaseConnection();
  verifyCreatedParentAnchors(moves, createdParents);
  const placements = moves.filter(move => move.from !== move.to);
  if (placements.length) moveWithParentOrder(placements, now);
  for (const move of moves) {
    if (!move.anchor) continue;
    driver.execute(`UPDATE nodes SET anchor_link = ?, anchor_resolution_status = 'resolved', anchor_source_version_id = ?, updated_at = ?, sync_dirty = 1
      WHERE id = ?`, [JSON.stringify(move.anchor.link), move.anchor.sourceVersionId, now, move.nodeId]);
  }
}
