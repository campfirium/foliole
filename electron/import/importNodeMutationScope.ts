import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadScopedChildOrders } from '../../lib/core/database/parentChildOrder.js';

export interface ImportMutationChildOrder {
  parentNodeId: string | null;
  childIds: string[];
}

export interface ImportMutationScope {
  childOrders: ImportMutationChildOrder[];
  /** Live nodes this import batch created besides the imported ones: a new Inbox or folders, highlight children. */
  createdNodeIds: string[];
  positionOf: (nodeId: string) => number | null;
}

interface ScopeRow {
  [column: string]: unknown;
  id: string;
  parent_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

/**
 * Ancestors of the imported nodes, walking up only while each step was created by this batch, so a new
 * Inbox or a folder created for the import is reported together with the parent whose children it joined.
 */
function readCreatedAncestors(driver: DatabaseDriver, nodeIds: readonly string[], batchStartedAt: string) {
  return driver.queryAll<ScopeRow>(
    `WITH RECURSIVE chain(id, parent_id, created_at, deleted_at) AS (
       SELECT id, parent_id, created_at, deleted_at FROM nodes
        WHERE id IN (SELECT parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?)))
       UNION
       SELECT n.id, n.parent_id, n.created_at, n.deleted_at FROM nodes n JOIN chain c ON n.id = c.parent_id
        WHERE c.created_at >= ?
     )
     SELECT id, parent_id, created_at, deleted_at FROM chain WHERE created_at >= ? AND deleted_at IS NULL`,
    [JSON.stringify(nodeIds), batchStartedAt, batchStartedAt]
  );
}

function readCreatedChildIds(driver: DatabaseDriver, nodeIds: readonly string[], batchStartedAt: string) {
  return driver.queryAll<{ id: string }>(
    `SELECT id FROM nodes WHERE parent_id IN (SELECT value FROM json_each(?))
       AND deleted_at IS NULL AND created_at >= ?`,
    [JSON.stringify(nodeIds), batchStartedAt]
  ).map((row) => row.id);
}

function readDeletedIds(driver: DatabaseDriver, nodeIds: readonly string[]) {
  return new Set(driver.queryAll<{ id: string }>(
    'SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS NOT NULL',
    [JSON.stringify(nodeIds)]
  ).map((row) => row.id));
}

/** The visible child sequences of the given parents, read without the library-wide order; Trash members are left out. */
export function loadVisibleChildOrders(driver: DatabaseDriver, parentNodeIds: Iterable<string | null>) {
  const orders = loadScopedChildOrders(driver, parentNodeIds);
  const deleted = readDeletedIds(driver, orders.flatMap((order) => order.childIds));
  const childOrders: ImportMutationChildOrder[] = orders.map(({ parentNodeId, childIds }) => ({
    parentNodeId, childIds: childIds.filter((id) => !deleted.has(id))
  }));
  const positions = new Map<string, number>();
  childOrders.forEach(({ childIds }) => childIds.forEach((id, index) => positions.set(id, index)));
  return { childOrders, positionOf: (nodeId: string) => positions.get(nodeId) ?? null };
}

/**
 * The parents an import batch changed and their visible child sequences, read without the library-wide order:
 * the imported nodes' parents, the imported nodes themselves (generated highlights), and the parent of every
 * ancestor the batch created.
 */
export function loadImportMutationScope(
  driver: DatabaseDriver,
  imported: ReadonlyArray<{ id: string; parent_id: string | null }>,
  batchStartedAt: string
): ImportMutationScope {
  const importedIds = imported.map((row) => row.id);
  const ancestors = readCreatedAncestors(driver, importedIds, batchStartedAt);
  const parents = [
    ...imported.map((row) => row.parent_id),
    ...importedIds,
    ...ancestors.map((row) => row.parent_id)
  ];
  const { childOrders, positionOf } = loadVisibleChildOrders(driver, parents);
  const importedSet = new Set(importedIds);
  const createdNodeIds = [...new Set([...ancestors.map((row) => row.id), ...readCreatedChildIds(driver, importedIds, batchStartedAt)])]
    .filter((id) => !importedSet.has(id));
  return { childOrders, createdNodeIds, positionOf };
}
