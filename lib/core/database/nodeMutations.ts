import type { NodeKind } from '../nodes/nodeKind.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import type { VirtualNodeFilter } from '../nodes/virtualNodeFilter.js';
import { stringifyVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';
import { ensureSpecialRootNodesForInput, ensureSpecialRootNodesForOrder } from './nodeMutationSpecialRoots.js';
import {
  createUpdateNodeAnchorLinkStatement,
  createUpsertNodeOrderStatement,
  createUpsertNodeReadingStatement,
  createUpsertNodeStatement
} from './nodeMutationStatements.js';
import { writeNodeReadingSnapshotWithSync } from './nodeReadingSyncState.js';
import { syncWorkspaceSearchIndexForNodeIds } from './workspaceSearchIndex.js';
import { bumpUntitledSequenceByParent } from './workspaceUntitledSequence.js';

interface NodeAnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    attachmentId?: string;
    from?: number;
    height?: number;
    originalText?: string;
    page?: number;
    to?: number;
    width?: number;
    x: number;
    y: number;
  } | {
    ranges: Array<{
      from: number;
      originalText: string;
      to: number;
    }>;
  } | {
    from: number;
    originalText: string;
    to: number;
  };
}

interface NodeReadingPayload {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

interface NodeImageRegionPayload {
  id: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

interface NodeImageRegionGroupPayload {
  attachmentId: string;
  regions: NodeImageRegionPayload[];
}

export interface UpsertNodeSnapshotInput {
  nodeId: string;
  deviceId?: string;
  parentNodeId: string | null;
  kind: NodeKind;
  priority?: number | null;
  desiredRetention?: number | null;
  title: string;
  isTitleManual: boolean;
  hideTitleHeading?: boolean;
  content: string;
  openingText?: string | null;
  virtualFilter?: VirtualNodeFilter | null;
  reveal: string | null;
  anchorLink: NodeAnchorLinkPayload | null;
  imageRegions?: NodeImageRegionGroupPayload[] | null;
  reading?: NodeReadingPayload | null;
  position: number | null;
  createdAt: string;
  updatedAt: string;
}

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

export function upsertNodeSnapshot(driver: DatabaseDriver, input: UpsertNodeSnapshotInput): void {
  const upsertNodeStatement = createUpsertNodeStatement(driver);
  const upsertNodeOrderStatement = createUpsertNodeOrderStatement(driver);
  const upsertNodeReadingStatement = createUpsertNodeReadingStatement(driver);
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');

  driver.transaction(() => {
    ensureSpecialRootNodesForInput(driver, input);
    const bodyBlobHash = upsertTextBodyBlob(driver, input.content, input.updatedAt);
    upsertNodeStatement.run([
      input.nodeId,
      input.parentNodeId,
      input.kind,
      input.priority ?? null,
      input.desiredRetention ?? null,
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
      input.position,
      input.deviceId ?? null,
      input.createdAt,
      input.updatedAt
    ]);
    if (typeof input.position === 'number') {
      upsertNodeOrderStatement.run([input.nodeId, input.position]);
    }
    writeNodeReadingSnapshotWithSync(driver, input, upsertNodeReadingStatement.run, deleteNodeReadingStatement.run);
    bumpUntitledSequenceByParent(driver, {
      parentNodeId: input.parentNodeId,
      title: input.title,
      updatedAt: input.updatedAt
    });
    syncWorkspaceSearchIndexForNodeIds(driver, [input.nodeId]);
  });
}

export function replaceNodeOrder(driver: DatabaseDriver, nodeIds: string[]): void {
  const deleteOrderStatement = driver.prepare('DELETE FROM node_order');
  const insertOrderStatement = driver.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');

  driver.transaction(() => {
    ensureSpecialRootNodesForOrder(driver, nodeIds);
    deleteOrderStatement.run();
    for (let index = 0; index < nodeIds.length; index += 1) {
      insertOrderStatement.run([nodeIds[index], index]);
    }
  });
}

export function updateNodeAnchorLinks(driver: DatabaseDriver, inputs: UpdateNodeAnchorLinkInput[]): void {
  const updateNodeAnchorLinkStatement = createUpdateNodeAnchorLinkStatement(driver);

  driver.transaction(() => {
    for (const input of inputs) {
      updateNodeAnchorLinkStatement.run([toAnchorLinkValue(input.anchorLink), input.updatedAt, input.nodeId]);
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
    syncWorkspaceSearchIndexForNodeIds(driver, input.nodeIds);
  });
}

export function restoreNodes(driver: DatabaseDriver, input: RestoreNodesInput): void {
  const restoredAt = new Date().toISOString();
  const clearDeletedAtStatement = driver.prepare('UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id = ?');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      clearDeletedAtStatement.run([restoredAt, nodeId]);
    }
    syncWorkspaceSearchIndexForNodeIds(driver, input.nodeIds);
  });
}

export function deleteNodesPermanently(driver: DatabaseDriver, input: DeleteNodesPermanentlyInput): string[] {
  const deleteReviewLogStatement = driver.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReviewStatement = driver.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeOrderStatement = driver.prepare('DELETE FROM node_order WHERE node_id = ?');
  const deleteNodeStatement = driver.prepare('DELETE FROM nodes WHERE id = ?');
  const clearOrderStatement = driver.prepare('DELETE FROM node_order');
  const insertOrderStatement = driver.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      deleteReviewLogStatement.run([nodeId]);
      deleteNodeReviewStatement.run([nodeId]);
      deleteNodeReadingStatement.run([nodeId]);
      deleteNodeOrderStatement.run([nodeId]);
    }
    for (const nodeId of [...input.nodeIds].reverse()) {
      deleteNodeStatement.run([nodeId]);
    }
    clearOrderStatement.run();
    for (let index = 0; index < input.nodeOrder.length; index += 1) {
      insertOrderStatement.run([input.nodeOrder[index], index]);
    }
    syncWorkspaceSearchIndexForNodeIds(driver, input.nodeIds);
  });

  return [];
}
