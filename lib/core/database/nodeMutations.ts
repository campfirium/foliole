import { stringifyManualChildOrder } from '../nodes/manualChildOrder.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import { assertNodeAnchorTextWithinBudget, assertNodeTextFieldsWithinBudget } from '../nodes/nodeTextBudget.js';
import { normalizeNodeTitle } from '../nodes/nodeTitleBudget.js';
import { stringifyVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import type { DatabaseDriver } from './driver.js';
import { serializeImageSources } from './imageSources.js';
import { initializeCreatedReviewSchedule } from './initialReviewSchedule.js';
import { describeNodeBacklinkSourceChange, type NodeBacklinkSourceChange } from './nodeBacklinks.js';
import type {
  NodeAnchorLinkPayload,
  NodeImageRegionGroupPayload,
  UpsertNodeSnapshotInput
} from './nodeMutationPayloads.js';
import { ensureSpecialRootNodesForInput } from './nodeMutationSpecialRoots.js';
import {
  createUpdateNodeAnchorLinkStatement,
  createUpsertNodeReadingHostStateStatement,
  createUpsertNodeReadingStatement,
  createUpsertNodeStatement
} from './nodeMutationStatements.js';
import { ensureNodeParentMembership } from './nodeOrderMutations.js';
import {
  deleteNodesPermanently,
  deleteNodesPermanentlyDeferringBodies,
  type DeleteNodesPermanentlyInput
} from './nodePermanentDeleteMutations.js';
import { writeNodeReadingSnapshotWithSync } from './nodeReadingSyncState.js';
import { resolveRestoreNodesResult, type RestoreNodesResult } from './nodeRestoreConflicts.js';
import { prepareNodeSearchInvalidationForUpsert } from './nodeSearchInvalidationForMutation.js';
import type { NodeSearchInvalidationOptions } from './nodeSearchInvalidationForMutation.js';
import {
  enqueueWorkspaceSearchDeleteInvalidationForSubtreeRootIds,
  enqueueWorkspaceSearchRestoreInvalidationForSubtreeRootIds
} from './searchIndexInvalidations.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';
import { hashTextBody } from './textBodyHash.js';
import { bumpUntitledSequenceByParent } from './workspaceUntitledSequence.js';

export type { RestoreNodesResult } from './nodeRestoreConflicts.js';
export type { UpsertNodeSnapshotInput } from './nodeMutationPayloads.js';
export type { MoveNodePatchInput, MoveNodesInput, MoveNodesResult } from './nodeMoveMutations.js';
export { moveNodes } from './nodeMoveMutations.js';
export { deleteNodesPermanently, deleteNodesPermanentlyDeferringBodies };
export { replaceNodeOrder } from './nodeOrderMutations.js';

export interface SoftDeleteNodesInput {
  nodeIds: string[];
  deletedAt: string;
}

export interface RestoreNodesInput {
  nodeIds: string[];
}

export type { DeleteNodesPermanentlyInput };

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
  return run([
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
    serializeImageSources(input.imageSources ?? {}),
    input.hostName ?? null,
    input.createdAt,
    input.updatedAt
  ]);
}

type PreviousNodeSnapshot = { title: string; parent_id: string | null; content?: string; deleted_at?: string | null };

export interface UpsertNodeSnapshotOptions {
  onBacklinkSourceChange?: (change: NodeBacklinkSourceChange | undefined) => void;
  parentMembership?: 'first';
  searchInvalidation?: NodeSearchInvalidationOptions;
}

function createUpsertNodeSnapshotStatements(driver: DatabaseDriver) {
  return {
    deleteNodeReading: driver.prepare('DELETE FROM node_reading WHERE node_id = ?'),
    deleteNodeReadingHostState: driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?'),
    upsertNode: createUpsertNodeStatement(driver),
    upsertNodeReading: createUpsertNodeReadingStatement(driver),
    upsertNodeReadingHostState: createUpsertNodeReadingHostStateStatement(driver)
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
  const backlinkColumns = options.onBacklinkSourceChange ? ', content, deleted_at' : '';
  driver.transaction(() => {
    const previousNode = driver.queryOne<PreviousNodeSnapshot>(
      `SELECT title, parent_id${backlinkColumns} FROM nodes WHERE id = ?`, [input.nodeId]);
    if (previousNode?.title !== input.title) input = { ...input, title: normalizeNodeTitle(input.title) };
    assertNodeTextFieldsWithinBudget(input);
    const resetGlobalUntitledSequence = !input.isTitleManual
      && input.anchorLink?.kind !== 'image-excerpt'
      && input.title.trim() === 'Untitled'
      && !driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = ?', [input.nodeId]);
    const enqueueSearchInvalidation = prepareNodeSearchInvalidationForUpsert(driver, input, previousNode, options.searchInvalidation);
    ensureSpecialRootNodesForInput(driver, input);
    // Every writer stores content and body_blob_hash together, so an unchanged body (a title or metadata
    // save) keeps its hash instead of hashing the whole text again.
    const previousBody = driver.queryOne<{ body_blob_hash: string | null; same_body: number }>(
      'SELECT body_blob_hash, content IS ? AS same_body FROM nodes WHERE id = ?', [input.content, input.nodeId]);
    const bodyBlobHash = previousBody?.body_blob_hash && previousBody.same_body === 1
      ? previousBody.body_blob_hash : hashTextBody(input.content);
    const { changes } = runNodeTableUpsert(statements.upsertNode.run, input, bodyBlobHash);
    if (!previousNode && input.kind === 'item') initializeCreatedReviewSchedule(driver, input.nodeId, input.review);
    if (!previousNode || previousNode.parent_id !== input.parentNodeId) {
      ensureNodeParentMembership(driver, input.nodeId, options.parentMembership);
    }
    if (input.reading !== undefined) writeNodeReadingSnapshotWithSync(driver, input, {
      deleteDeviceState: statements.deleteNodeReadingHostState.run,
      deleteReading: statements.deleteNodeReading.run,
      upsertDeviceState: statements.upsertNodeReadingHostState.run,
      upsertReading: statements.upsertNodeReading.run
    });
    bumpUntitledSequenceByParent(driver, {
      isImageExcerpt: input.anchorLink?.kind === 'image-excerpt',
      isTitleManual: input.isTitleManual,
      parentNodeId: input.parentNodeId,
      resetGlobalUntitledSequence,
      title: input.title,
      updatedAt: input.updatedAt
    });
    enqueueSearchInvalidation();
    if (previousBody?.body_blob_hash && previousBody.body_blob_hash !== bodyBlobHash) {
      collectTextBodyBlobCandidates(driver, [previousBody.body_blob_hash]);
    }
    if (options.onBacklinkSourceChange) {
      const previous = previousNode?.deleted_at === null && previousNode.content !== undefined
        ? { title: previousNode.title, content: previousNode.content } : undefined;
      options.onBacklinkSourceChange(describeNodeBacklinkSourceChange(input.nodeId, previous, changes ? input : previous));
    }
  });
}

export function updateNodeAnchorLinks(driver: DatabaseDriver, inputs: UpdateNodeAnchorLinkInput[]): void {
  for (const input of inputs) assertNodeAnchorTextWithinBudget(input.anchorLink);
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
  driver.execute('DELETE FROM parent_order_sources');
  driver.execute("DELETE FROM sync_object_state WHERE object_type = 'parent_child_order'");
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
