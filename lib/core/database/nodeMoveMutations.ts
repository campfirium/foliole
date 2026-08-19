import type { DatabaseDriver } from './driver.js';
import type { UpsertNodeSnapshotInput } from './nodeMutationPayloads.js';
import {
  createUpsertNodeReadingHostStateStatement,
  createUpsertNodeReadingStatement
} from './nodeMutationStatements.js';
import { rewriteExistingNodeOrder } from './nodeOrderMutations.js';
import { type WriteNodeReadingSyncInput, writeNodeReadingSnapshotWithSync } from './nodeReadingSyncState.js';
import { enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds } from './searchIndexInvalidations.js';

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
  hostName?: string;
  parentNodeId: string | null;
  reading?: UpsertNodeSnapshotInput['reading'];
  sequentialReadingEnabled?: boolean | null;
  updatedAt: string;
}

interface ExistingMoveParentRow {
  [column: string]: unknown;
  parent_id: string | null;
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
  const upsertNodeReadingHostStateStatement = createUpsertNodeReadingHostStateStatement(driver);
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeReadingHostStateStatement = driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?');

  driver.transaction(() => {
    const pathInvalidationNodeIds = readPathInvalidationNodeIds(driver, input.nodes);
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
          deleteDeviceState: deleteNodeReadingHostStateStatement.run,
          deleteReading: deleteNodeReadingStatement.run,
          upsertDeviceState: upsertNodeReadingHostStateStatement.run,
          upsertReading: upsertNodeReadingStatement.run
        });
      }
    }
    rewriteExistingNodeOrder(driver, input.nodeOrder);
    enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(driver, pathInvalidationNodeIds);
  });
  return {
    movedNodeIds: input.nodes.map((node) => node.nodeId),
    nodeOrder: input.nodeOrder
  };
}

function readPathInvalidationNodeIds(driver: DatabaseDriver, nodes: MoveNodePatchInput[]) {
  return nodes
    .filter((node) => {
      const existing = driver.queryOne<ExistingMoveParentRow>('SELECT parent_id FROM nodes WHERE id = ?', [
        node.nodeId
      ]);
      return Boolean(existing && existing.parent_id !== node.parentNodeId);
    })
    .map((node) => node.nodeId);
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
  if (node.hostName) input.hostName = node.hostName;
  return input;
}
