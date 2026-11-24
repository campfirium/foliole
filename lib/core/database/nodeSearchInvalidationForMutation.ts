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
  existingPathRow: ExistingNodePathRow | undefined,
  options: NodeSearchInvalidationOptions = {}
) {
  return () => {
    enqueueWorkspaceSearchInvalidationForNodeIds(driver, [input.nodeId], {
      requestProcessing: options.workspaceInvalidation !== 'defer'
    });
    if (existingPathRow && (existingPathRow.parent_id !== input.parentNodeId || existingPathRow.title !== input.title)) {
      enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(
        driver,
        [input.nodeId],
        options.workspaceInvalidation === 'defer'
          ? { advanceSourceRevision: false, requestProcessing: false }
          : {}
      );
    }
  };
}
