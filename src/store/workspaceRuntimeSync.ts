import type { Node } from '../features/nodes/model/nodeTypes';
import {
  deleteWorkspaceNodesPermanently,
  restoreWorkspaceNodes,
  saveCreatedWorkspaceNodeSnapshot,
  saveWorkspaceNodeContentSnapshot,
  saveWorkspaceNodeContentSnapshotWithAnchors,
  saveWorkspaceNodeOrder,
  saveWorkspaceNodeRevealSnapshot,
  saveWorkspaceReadingProgress,
  saveWorkspaceRelearnNode,
  saveWorkspaceReviewGrade,
  softDeleteWorkspaceNodes
} from '../shared/platform/workspaceRuntimeRepository';
import type {
  WorkspaceReadingProgressSavePayload,
  WorkspaceRelearnNodePayload,
  WorkspaceReviewGradeSyncPayload,
  WorkspaceRuntimeNode,
  WorkspaceRuntimeNodeDocument
} from '../shared/platform/workspaceRuntimeTypes';

import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';

function isWorkspaceNodeDocumentLoaded(node: WorkspaceRuntimeNode) {
  return isNodeDocumentLoaded(node);
}

function mergeWorkspaceRuntimeNodeDocument(
  node: WorkspaceRuntimeNode,
  document: WorkspaceRuntimeNodeDocument
): WorkspaceRuntimeNode {
  return mergeWorkspaceNodeDocument(node, document);
}

function createNodeSnapshotArgs(node: Node, position?: number) {
  return {
    isDocumentLoaded: isWorkspaceNodeDocumentLoaded,
    mergeDocument: mergeWorkspaceRuntimeNodeDocument,
    node,
    ...(position !== undefined ? { position } : {})
  };
}

export function syncNodeContentToRuntime(node: Node, position?: number) {
  saveWorkspaceNodeContentSnapshot(createNodeSnapshotArgs(node, position));
}

export function syncNodeContentWithAnchorsToRuntime(parentNode: Node, affectedAnchorNodes: Node[], nodeOrder: string[]) {
  if (affectedAnchorNodes.length === 0) {
    syncNodeContentToRuntime(parentNode, nodeOrder.indexOf(parentNode.id));
    return;
  }
  saveWorkspaceNodeContentSnapshotWithAnchors({ parentNode, affectedAnchorNodes, nodeOrder });
}

export function syncCreateNodeToRuntime(node: Node, position?: number) {
  saveCreatedWorkspaceNodeSnapshot(createNodeSnapshotArgs(node, position));
}

export function syncNodeRevealToRuntime(node: Node, position?: number) {
  saveWorkspaceNodeRevealSnapshot(createNodeSnapshotArgs(node, position));
}

export function syncNodeOrderToRuntime(nodeOrder: string[]) {
  saveWorkspaceNodeOrder(nodeOrder);
}

export async function syncReviewGradeToRuntime(payload: WorkspaceReviewGradeSyncPayload): Promise<void> {
  await saveWorkspaceReviewGrade(payload);
}

export function syncRelearnNodeToRuntime(payload: WorkspaceRelearnNodePayload) {
  saveWorkspaceRelearnNode(payload);
}

export function syncSoftDeleteNodesToRuntime(payload: { nodeIds: string[]; deletedAt: string }) {
  softDeleteWorkspaceNodes(payload);
}

export function syncRestoreNodesToRuntime(payload: { nodeIds: string[] }) {
  restoreWorkspaceNodes(payload);
}

export function syncDeleteNodesPermanentlyToRuntime(payload: { nodeIds: string[]; nodeOrder: string[] }) {
  deleteWorkspaceNodesPermanently(payload);
}

export function syncReadingProgressToRuntime(payload: WorkspaceReadingProgressSavePayload) {
  saveWorkspaceReadingProgress(payload);
}
