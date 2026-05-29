import { stringifyManualChildOrder } from '../nodes/manualChildOrder.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import { stringifyVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';
import type {
  NodeAnchorLinkPayload,
  NodeImageRegionGroupPayload,
  UpsertNodeSnapshotInput
} from './nodeMutationPayloads.js';
import { ensureSpecialRootNodesForInput } from './nodeMutationSpecialRoots.js';
import {
  createUpdateNodeAnchorLinkStatement,
  createUpsertNodeOrderStatement,
  createUpsertNodeReadingDeviceStateStatement,
  createUpsertNodeReadingStatement,
  createUpsertNodeStatement
} from './nodeMutationStatements.js';
import { rewriteExistingNodeOrder } from './nodeOrderMutations.js';
import { writeNodeReadingSnapshotWithSync } from './nodeReadingSyncState.js';
import { resolveRestoreNodesResult, type RestoreNodesResult } from './nodeRestoreConflicts.js';
import { createUpsertNodeReviewStatement } from './nodeReviewMutationStatements.js';
import { writeNodeReviewSnapshotWithSync } from './nodeReviewSyncState.js';
import { prepareNodeSearchInvalidationForUpsert } from './nodeSearchInvalidationForMutation.js';
import type { NodeSearchInvalidationOptions } from './nodeSearchInvalidationForMutation.js';
import {
  enqueueWorkspaceSearchDeleteInvalidationForSubtreeRootIds,
  enqueueWorkspaceSearchRestoreInvalidationForSubtreeRootIds
} from './searchIndexInvalidations.js';
import { deleteWorkspaceSearchIndexForExistingSubtreeRootIds } from './workspaceSearchSubtreeIndex.js';
import { bumpUntitledSequenceByParent } from './workspaceUntitledSequence.js';

export type { RestoreNodesResult } from './nodeRestoreConflicts.js';
export type { UpsertNodeSnapshotInput } from './nodeMutationPayloads.js';
export type { MoveNodePatchInput, MoveNodesInput, MoveNodesResult } from './nodeMoveMutations.js';
export { moveNodes } from './nodeMoveMutations.js';
export { replaceNodeOrder } from './nodeOrderMutations.js';

export interface SoftDeleteNodesInput {
  nodeIds: string[];
  deletedAt: string;
}

export interface RestoreNodesInput {
  nodeIds: string[];
}

export interface DeleteNodesPermanentlyInput {
  nodeIds: string[];
  nodeOrder: string[];
}

export interface UpdateNodeAnchorLinkInput {
  anchorLink: NodeAnchorLinkPayload;
  imageRegions?: NodeImageRegionGroupPayload[] | null;
  nodeId: string;
  updatedAt: string;
}

function toAnchorLinkValue(anchorLink: NodeAnchorLinkPayload | null): string | null {
  return anchorLink ? JSON.stringify(anchorLink) : null;
}

function toImageRegionsValue(imageRegions: NodeImageRegionGroupPayload[] | null | undefined): string | null {
  return imageRegions && imageRegions.length > 0 ? JSON.stringify(imageRegions) : null;
}

function resolveStoredOpeningText(input: Pick<UpsertNodeSnapshotInput, 'content' | 'kind' | 'openingText' | 'title'>) {
  if ('openingText' in input) {
    return input.openingText ?? null;
  }
  if (input.kind === 'folder') {
    return null;
  }
  return resolveNodeOpeningText(input.content, input.title);
}

function runNodeTableUpsert(
  run: ReturnType<typeof createUpsertNodeStatement>['run'],
  input: UpsertNodeSnapshotInput,
  bodyBlobHash: string | null
) {
  run([
    input.nodeId,
    input.parentNodeId,
    input.kind,
    input.priority ?? null,
    input.desiredRetention ?? null,
    input.enableShortTerm == null ? null : input.enableShortTerm ? 1 : 0,
    input.sequentialReadingEnabled == null ? null : input.sequentialReadingEnabled ? 1 : 0,
    input.shelvedAt ?? null,
    input.kind === 'folder' ? stringifyManualChildOrder(input.manualChildOrder) : null,
    input.title,
    input.isTitleManual ? 1 : 0,
    input.hideTitleHeading === true ? 1 : 0,
    input.content,
    bodyBlobHash,
    resolveStoredOpeningText(input),
    stringifyVirtualNodeFilter(input.virtualFilter ?? null),
    input.reveal,
    toAnchorLinkValue(input.anchorLink),
    toImageRegionsValue(input.imageRegions),
    null,
    input.deviceId ?? null,
    input.createdAt,
    input.updatedAt
  ]);
}

export interface UpsertNodeSnapshotOptions {
  searchInvalidation?: NodeSearchInvalidationOptions;
}

function createUpsertNodeSnapshotStatements(driver: DatabaseDriver) {
  return {
    deleteNodeReading: driver.prepare('DELETE FROM node_reading WHERE node_id = ?'),
    deleteNodeReadingDeviceState: driver.prepare('DELETE FROM node_reading_device_state WHERE node_id = ?'),
    upsertNode: createUpsertNodeStatement(driver),
    upsertNodeOrder: createUpsertNodeOrderStatement(driver),
    upsertNodeReading: createUpsertNodeReadingStatement(driver),
    upsertNodeReadingDeviceState: createUpsertNodeReadingDeviceStateStatement(driver),
    upsertNodeReview: createUpsertNodeReviewStatement(driver)
  };
}

let upsertNodeSnapshotStatementCache = new WeakMap<
  DatabaseDriver,
  ReturnType<typeof createUpsertNodeSnapshotStatements>
>();

export function resetUpsertNodeSnapshotStatementCacheForTests() {
  upsertNodeSnapshotStatementCache = new WeakMap();
}

function getUpsertNodeSnapshotStatements(driver: DatabaseDriver) {
  let statements = upsertNodeSnapshotStatementCache.get(driver);
  if (!statements) {
    statements = createUpsertNodeSnapshotStatements(driver);
    upsertNodeSnapshotStatementCache.set(driver, statements);
  }
  return statements;
}

export function upsertNodeSnapshot(
  driver: DatabaseDriver,
  input: UpsertNodeSnapshotInput,
  options: UpsertNodeSnapshotOptions = {}
): void {
  const statements = getUpsertNodeSnapshotStatements(driver);

  driver.transaction(() => {
    const enqueueSearchInvalidation = prepareNodeSearchInvalidationForUpsert(driver, input, options.searchInvalidation);
    ensureSpecialRootNodesForInput(driver, input);
    const bodyBlobHash = upsertTextBodyBlob(driver, input.content, input.updatedAt);
    runNodeTableUpsert(statements.upsertNode.run, input, bodyBlobHash);
    if (input.kind === 'folder' && typeof input.position === 'number') {
      statements.upsertNodeOrder.run([input.nodeId, input.position]);
    }
    writeNodeReadingSnapshotWithSync(driver, input, {
      deleteDeviceState: statements.deleteNodeReadingDeviceState.run,
      deleteReading: statements.deleteNodeReading.run,
      upsertDeviceState: statements.upsertNodeReadingDeviceState.run,
      upsertReading: statements.upsertNodeReading.run
    });
    writeNodeReviewSnapshotWithSync(driver, input, statements.upsertNodeReview.run);
    bumpUntitledSequenceByParent(driver, {
      parentNodeId: input.parentNodeId,
      title: input.title,
      updatedAt: input.updatedAt
    });
    enqueueSearchInvalidation();
  });
}

export function updateNodeAnchorLinks(driver: DatabaseDriver, inputs: UpdateNodeAnchorLinkInput[]): void {
  const updateNodeAnchorLinkStatement = createUpdateNodeAnchorLinkStatement(driver);

  driver.transaction(() => {
    for (const input of inputs) {
      updateNodeAnchorLinkStatement.run([
        toAnchorLinkValue(input.anchorLink),
        toImageRegionsValue(input.imageRegions),
        input.updatedAt,
        input.nodeId
      ]);
    }
  });
}

export function clearNodeOrder(driver: DatabaseDriver): void {
  driver.execute('DELETE FROM node_order');
}

export function softDeleteNodes(driver: DatabaseDriver, input: SoftDeleteNodesInput): void {
  const setDeletedAtStatement = driver.prepare('UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ?');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      setDeletedAtStatement.run([input.deletedAt, input.deletedAt, nodeId]);
    }
    enqueueWorkspaceSearchDeleteInvalidationForSubtreeRootIds(driver, input.nodeIds);
  });
}

export function restoreNodes(driver: DatabaseDriver, input: RestoreNodesInput): RestoreNodesResult {
  const restoredAt = new Date().toISOString();
  const clearDeletedAtStatement = driver.prepare('UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id = ?');

  return driver.transaction(() => {
    const result = resolveRestoreNodesResult(driver, input.nodeIds);
    for (const nodeId of result.restoredNodeIds) {
      clearDeletedAtStatement.run([restoredAt, nodeId]);
    }
    enqueueWorkspaceSearchRestoreInvalidationForSubtreeRootIds(driver, result.restoredNodeIds);
    return result;
  });
}

export function deleteNodesPermanently(driver: DatabaseDriver, input: DeleteNodesPermanentlyInput): string[] {
  const deleteReviewLogStatement = driver.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReviewStatement = driver.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeReadingDeviceStateStatement = driver.prepare('DELETE FROM node_reading_device_state WHERE node_id = ?');
  const deleteNodeOrderStatement = driver.prepare('DELETE FROM node_order WHERE node_id = ?');
  const deleteNodeStatement = driver.prepare('DELETE FROM nodes WHERE id = ?');
  driver.transaction(() => {
    deleteWorkspaceSearchIndexForExistingSubtreeRootIds(driver, input.nodeIds);
    for (const nodeId of input.nodeIds) {
      deleteReviewLogStatement.run([nodeId]);
      deleteNodeReviewStatement.run([nodeId]);
      deleteNodeReadingStatement.run([nodeId]);
      deleteNodeReadingDeviceStateStatement.run([nodeId]);
      deleteNodeOrderStatement.run([nodeId]);
    }
    for (const nodeId of [...input.nodeIds].reverse()) {
      deleteNodeStatement.run([nodeId]);
    }
    rewriteExistingNodeOrder(driver, input.nodeOrder);
  });

  return [];
}
