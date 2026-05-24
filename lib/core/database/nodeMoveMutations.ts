import type { DatabaseDriver } from './driver.js';
import type { UpsertNodeSnapshotInput } from './nodeMutationPayloads.js';
import {
  createUpsertNodeReadingDeviceStateStatement,
  createUpsertNodeReadingStatement
} from './nodeMutationStatements.js';
import { rewriteExistingNodeOrder } from './nodeOrderMutations.js';
import { type WriteNodeReadingSyncInput, writeNodeReadingSnapshotWithSync } from './nodeReadingSyncState.js';

export interface MoveNodesInput {
  nodeOrder: string[];
  nodes: MoveNodePatchInput[];
}

export interface MoveNodesResult {
  movedNodeIds: string[];
  nodeOrder: string[];
}

export interface MoveNodePatchInput {
  nodeId: string;
  deviceId?: string;
  parentNodeId: string | null;
  reading?: UpsertNodeSnapshotInput['reading'];
  sequentialReadingEnabled?: boolean | null;
  updatedAt: string;
}

export function moveNodes(driver: DatabaseDriver, input: MoveNodesInput): MoveNodesResult {
  const updateNodeMoveStatement = driver.prepare(
    `UPDATE nodes
     SET parent_id = ?,
         sequential_reading_enabled = ?,
         updated_at = ?,
         last_modified_by_device_id = COALESCE(?, last_modified_by_device_id),
         sync_dirty = 1
     WHERE id = ?`
  );
  const upsertNodeReadingStatement = createUpsertNodeReadingStatement(driver);
  const upsertNodeReadingDeviceStateStatement = createUpsertNodeReadingDeviceStateStatement(driver);
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeReadingDeviceStateStatement = driver.prepare('DELETE FROM node_reading_device_state WHERE node_id = ?');

  driver.transaction(() => {
    for (const node of input.nodes) {
      updateNodeMoveStatement.run([
        node.parentNodeId,
        node.sequentialReadingEnabled == null ? null : node.sequentialReadingEnabled ? 1 : 0,
        node.updatedAt,
        node.deviceId ?? null,
        node.nodeId
      ]);
      if ('reading' in node) {
        writeNodeReadingSnapshotWithSync(driver, toReadingSyncInput(node), {
          deleteDeviceState: deleteNodeReadingDeviceStateStatement.run,
          deleteReading: deleteNodeReadingStatement.run,
          upsertDeviceState: upsertNodeReadingDeviceStateStatement.run,
          upsertReading: upsertNodeReadingStatement.run
        });
      }
    }
    rewriteExistingNodeOrder(driver, input.nodeOrder);
  });
  return {
    movedNodeIds: input.nodes.map((node) => node.nodeId),
    nodeOrder: input.nodeOrder
  };
}

function toReadingSyncInput(node: MoveNodePatchInput): WriteNodeReadingSyncInput {
  const input: WriteNodeReadingSyncInput = {
    nodeId: node.nodeId,
    reading: node.reading ?? null,
    updatedAt: node.updatedAt
  };
  if (node.deviceId) {
    input.deviceId = node.deviceId;
  }
  return input;
}
