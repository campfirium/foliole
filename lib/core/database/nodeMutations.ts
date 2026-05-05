import type { NodeKind } from '../nodes/nodeKind.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import type { VirtualNodeFilter } from '../nodes/virtualNodeFilter.js';
import { stringifyVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import type { DatabaseBindParams, DatabaseDriver } from './driver.js';
import { cleanupDeletedTextAnchors } from './nodeDeletedAnchorCleanup.js';
import { ensureSpecialRootNodesForInput, ensureSpecialRootNodesForOrder } from './nodeMutationSpecialRoots.js';
import {
  createUpsertNodeOrderStatement,
  createUpsertNodeReadingStatement,
  createUpsertNodeStatement
} from './nodeMutationStatements.js';
import { bumpUntitledSequenceByParent } from './workspaceUntitledSequence.js';

interface NodeAnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    attachmentId?: string;
    height?: number;
    page?: number;
    width?: number;
    x: number;
    y: number;
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

function writeNodeReadingSnapshot(
  input: UpsertNodeSnapshotInput,
  runUpsert: (params?: DatabaseBindParams) => void,
  runDelete: (params?: DatabaseBindParams) => void
) {
  if (!input.reading) {
    runDelete([input.nodeId]);
    return;
  }
  runUpsert([
    input.nodeId,
    input.reading.intervalDurationMs,
    input.reading.intervalGrowthFactor,
    input.reading.lastHandledAt,
    input.reading.nextAt,
    input.reading.priority,
    input.reading.readingPosition,
    input.reading.repetitionCount,
    input.reading.state
  ]);
}

export function upsertNodeSnapshot(driver: DatabaseDriver, input: UpsertNodeSnapshotInput): void {
  const upsertNodeStatement = createUpsertNodeStatement(driver);
  const upsertNodeOrderStatement = createUpsertNodeOrderStatement(driver);
  const upsertNodeReadingStatement = createUpsertNodeReadingStatement(driver);
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');

  driver.transaction(() => {
    ensureSpecialRootNodesForInput(driver, input);
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
      resolveStoredOpeningText(input),
      stringifyVirtualNodeFilter(input.virtualFilter ?? null),
      input.reveal,
      toAnchorLinkValue(input.anchorLink),
      toImageRegionsValue(input.imageRegions),
      input.createdAt,
      input.updatedAt
    ]);
    if (typeof input.position === 'number') {
      upsertNodeOrderStatement.run([input.nodeId, input.position]);
    }
    writeNodeReadingSnapshot(input, upsertNodeReadingStatement.run, deleteNodeReadingStatement.run);
    bumpUntitledSequenceByParent(driver, {
      parentNodeId: input.parentNodeId,
      title: input.title,
      updatedAt: input.updatedAt
    });
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

export function clearNodeOrder(driver: DatabaseDriver): void {
  driver.execute('DELETE FROM node_order');
}

export function softDeleteNodes(driver: DatabaseDriver, input: SoftDeleteNodesInput): void {
  const setDeletedAtStatement = driver.prepare('UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ?');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      setDeletedAtStatement.run([input.deletedAt, input.deletedAt, nodeId]);
    }
  });
}

export function restoreNodes(driver: DatabaseDriver, input: RestoreNodesInput): void {
  const restoredAt = new Date().toISOString();
  const clearDeletedAtStatement = driver.prepare('UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id = ?');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      clearDeletedAtStatement.run([restoredAt, nodeId]);
    }
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
  const deletedAt = new Date().toISOString();
  let affectedParentNodeIds: string[] = [];

  driver.transaction(() => {
    affectedParentNodeIds = cleanupDeletedTextAnchors(driver, input.nodeIds, deletedAt);
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
  });

  return affectedParentNodeIds;
}
