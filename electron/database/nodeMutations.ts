import {
  moveNodes as moveNodesViaDriver,
  replaceNodeOrder as replaceNodeOrderViaDriver,
  restoreNodes as restoreNodesViaDriver,
  softDeleteNodes as softDeleteNodesViaDriver,
  updateNodeAnchorLinks as updateNodeAnchorLinksViaDriver,
  upsertNodeSnapshot as upsertNodeSnapshotViaDriver
} from '../../lib/core/database/nodeMutations.js';
import type {
  DeleteNodesPermanentlyInput,
  MoveNodesInput,
  MoveNodesResult,
  RestoreNodesInput,
  RestoreNodesResult,
  SoftDeleteNodesInput,
  UpdateNodeAnchorLinkInput,
  UpsertNodeSnapshotInput
} from '../../lib/core/database/nodeMutations.js';
import type { UpsertNodeSnapshotOptions } from '../../lib/core/database/nodeMutations.js';
import { collectTextBodyBlobCandidates } from '../../lib/core/database/textBodyBlobCollection.js';
import { assertFoliolePublishedDeleteAllowed } from '../foliolePublish/foliolePublishManagement.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { deletePermanentDeleteChunk, finishPermanentDelete, preparePermanentDelete } from './nodePermanentDeleteChunks.js';
import { flushDirtyNodeSyncVersions, flushNodeSyncVersion } from './nodeSyncVersions.js';
import {
  clearNodeSourceDisposition,
  recordNodeSourceDisposition
} from './sourceDispositionStates.js';
import { withTransaction } from './transaction.js';

export type {
  DeleteNodesPermanentlyInput,
  MoveNodesInput,
  MoveNodesResult,
  RestoreNodesInput,
  RestoreNodesResult,
  SoftDeleteNodesInput,
  UpdateNodeAnchorLinkInput,
  UpsertNodeSnapshotInput
};

export function upsertNodeSnapshot(input: UpsertNodeSnapshotInput, options: UpsertNodeSnapshotOptions = {}): void {
  upsertNodeSnapshotViaDriver(openDatabaseConnection().driver, {
    ...input,
    hostName: loadOrCreateDesktopHostName(input.updatedAt)
  }, options);
  if ('reading' in input) {
    if (input.reading?.state === 'dismissed') {
      recordNodeSourceDisposition(input.nodeId, 'dismissed', input.updatedAt);
    } else {
      clearNodeSourceDisposition(input.nodeId);
    }
  }
}

export function upsertNodeSnapshotWithOrder(input: UpsertNodeSnapshotInput, nodeOrder: string[], options: UpsertNodeSnapshotOptions = {}): void {
  const connection = openDatabaseConnection();
  const hostName = loadOrCreateDesktopHostName(input.updatedAt);
  withTransaction(connection.driver, () => {
    upsertNodeSnapshotViaDriver(connection.driver, {
      ...input,
      hostName
    }, options);
    replaceNodeOrderViaDriver(connection.driver, nodeOrder);
  });
  if ('reading' in input) {
    if (input.reading?.state === 'dismissed') {
      recordNodeSourceDisposition(input.nodeId, 'dismissed', input.updatedAt);
    } else {
      clearNodeSourceDisposition(input.nodeId);
    }
  }
}

export function replaceNodeOrder(nodeIds: string[]): void {
  const connection = openDatabaseConnection();
  withTransaction(connection.driver, () => {
    replaceNodeOrderViaDriver(connection.driver, nodeIds);
  });
}

export function moveNodes(input: MoveNodesInput): MoveNodesResult {
  const connection = openDatabaseConnection();
  const now = new Date().toISOString();
  const hostName = loadOrCreateDesktopHostName(now);
  return withTransaction(connection.driver, () => {
    const result = moveNodesViaDriver(connection.driver, {
      nodeOrder: input.nodeOrder,
      nodes: input.nodes.map((node) => ({ ...node, hostName }))
    });
    for (const node of input.nodes) {
      connection.driver.execute(
        `UPDATE nodes
         SET last_modified_by_host_name = ?, sync_dirty = 1
         WHERE id = ?`,
        [hostName, node.nodeId]
      );
    }
    return result;
  });
}

export function updateNodeAnchorLinks(inputs: UpdateNodeAnchorLinkInput[]): void {
  updateNodeAnchorLinksViaDriver(openDatabaseConnection().driver, inputs);
}

export function softDeleteNodes(input: SoftDeleteNodesInput): void {
  assertFoliolePublishedDeleteAllowed(input.nodeIds);
  const connection = openDatabaseConnection();
  const hostName = loadOrCreateDesktopHostName(input.deletedAt);
  for (const nodeId of input.nodeIds) {
    flushNodeSyncVersion(nodeId, input.deletedAt);
  }
  withTransaction(connection.driver, () => {
    softDeleteNodesViaDriver(connection.driver, input);
    for (const nodeId of input.nodeIds) {
      recordNodeSourceDisposition(nodeId, 'soft_deleted', input.deletedAt);
      connection.driver.execute(
        `UPDATE nodes
         SET last_modified_by_host_name = ?, sync_dirty = 1
         WHERE id = ?`,
        [hostName, nodeId]
      );
    }
  });
  for (const nodeId of input.nodeIds) {
    flushNodeSyncVersion(nodeId, input.deletedAt);
  }
}

export function restoreNodes(input: RestoreNodesInput): RestoreNodesResult {
  const connection = openDatabaseConnection();
  const now = new Date().toISOString();
  const hostName = loadOrCreateDesktopHostName(now);
  return withTransaction(connection.driver, () => {
    const result = restoreNodesViaDriver(connection.driver, input);
    for (const nodeId of result.restoredNodeIds) {
      clearNodeSourceDisposition(nodeId);
      connection.driver.execute(
        `UPDATE nodes
         SET last_modified_by_host_name = ?, sync_dirty = 1
         WHERE id = ?`,
        [hostName, nodeId]
      );
    }
    return result;
  });
}

/** Synchronous whole-set deletion for maintenance callers; the trash command uses the chunked path. */
export function deleteNodesPermanently(input: DeleteNodesPermanentlyInput): string[] {
  const plan = preparePermanentDelete(input.nodeIds);
  const released = deletePermanentDeleteChunk(plan.nodeIds);
  if (released.length) collectTextBodyBlobCandidates(openDatabaseConnection().driver, released);
  finishPermanentDelete(plan, input.nodeOrder);
  return [];
}

export function flushAllDirtyNodeSyncVersions() {
  return flushDirtyNodeSyncVersions();
}
