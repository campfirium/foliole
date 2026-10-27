import type { NativeMoveNodesArgs, NativeMoveNodesResult } from '../../platform/nativeMoveContract.js';
import { buildSequentialReadingMaintenancePatch } from '../review/sequentialReadingMaintenance.js';

import type { DatabaseDriver } from './driver.js';
import { loadMoveReadingContext, type captureMoveReadingScope } from './nodeMoveReadingContext.js';
import { createUpsertNodeReadingHostStateStatement, createUpsertNodeReadingStatement } from './nodeMutationStatements.js';
import { writeNodeReadingSnapshotWithSync } from './nodeReadingSyncState.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';

export function maintainMoveReading(driver: DatabaseDriver, input: NativeMoveNodesArgs,
  scope: ReturnType<typeof captureMoveReadingScope>, before: ReturnType<typeof loadMoveReadingContext>
): NativeMoveNodesResult['readings'] {
  const after = loadMoveReadingContext(driver, scope);
  const now = new Date().toISOString();
  const patch = buildSequentialReadingMaintenancePatch({ ...after, now, defaultPriority: input.defaultPriority,
    changedRootNodeIds: input.nodes.map((node) => node.nodeId), previousNodesById: before.nodesById });
  const upsertReading = createUpsertNodeReadingStatement(driver);
  const upsertDevice = createUpsertNodeReadingHostStateStatement(driver);
  const deleteReading = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteDevice = driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?');
  for (const change of patch?.changes ?? []) {
    writeNodeReadingSnapshotWithSync(driver, { nodeId: change.nodeId, reading: change.afterReading,
      hostName: requireDatabaseHostName(driver), updatedAt: now }, {
      upsertReading: upsertReading.run, upsertDeviceState: upsertDevice.run,
      deleteReading: deleteReading.run, deleteDeviceState: deleteDevice.run
    });
  }
  const accepted = patch?.nodesById ?? after.nodesById;
  return Object.values(accepted).filter((node) => scope.descendantIds.has(node.id))
    .map((node) => ({ nodeId: node.id, reading: node.reading ?? null }));
}
