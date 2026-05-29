import type { DatabaseDriver } from './driver.js';
import type { UpsertNodeSnapshotInput } from './nodeMutations.js';
import {
  enqueueWorkspaceSearchInvalidationForNodeIds,
  enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds
} from './searchIndexInvalidations.js';

interface ExistingNodePathRow {
  [column: string]: unknown;
  parent_id: string | null;
  title: string;
}

export interface NodeSearchInvalidationOptions {
  workspaceInvalidation?: 'defer' | 'enqueue';
}

export function prepareNodeSearchInvalidationForUpsert(
  driver: DatabaseDriver,
  input: UpsertNodeSnapshotInput,
  options: NodeSearchInvalidationOptions = {}
) {
  const existingPathRow = driver.queryOne<ExistingNodePathRow>('SELECT parent_id, title FROM nodes WHERE id = ?', [
    input.nodeId
  ]);
  return () => {
    if (options.workspaceInvalidation !== 'defer') {
      enqueueWorkspaceSearchInvalidationForNodeIds(driver, [input.nodeId]);
    }
    if (existingPathRow && (existingPathRow.parent_id !== input.parentNodeId || existingPathRow.title !== input.title)) {
      enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(driver, [input.nodeId]);
    }
  };
}
