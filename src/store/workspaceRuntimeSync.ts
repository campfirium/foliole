import type { Node } from '../features/nodes/model/nodeTypes';
import {
  deleteWorkspaceNodesPermanently,
  moveWorkspaceNodes,
  restoreWorkspaceNodes,
  saveCreatedWorkspaceNodeSnapshot,
  saveWorkspaceNodeContentSnapshot,
  saveWorkspaceNodeContentSnapshotNow,
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
  WorkspaceDeleteNodesPermanentlyResult,
  WorkspaceMoveNodesPayload,
  WorkspaceMoveNodesResult,
  WorkspaceRestoreNodesResult,
  WorkspaceReviewGradeSyncPayload,
  WorkspaceSoftDeleteNodesResult,
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

export async function syncNodeContentToRuntimeNow(node: Node, position?: number): Promise<boolean> {
  return saveWorkspaceNodeContentSnapshotNow(createNodeSnapshotArgs(node, position));
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

export async function syncMoveNodesToRuntime(payload: WorkspaceMoveNodesPayload): Promise<WorkspaceMoveNodesResult | undefined> {
  return moveWorkspaceNodes(payload);
}

export async function syncReviewGradeToRuntime(payload: WorkspaceReviewGradeSyncPayload): Promise<void> {
  await saveWorkspaceReviewGrade(payload);
}

export function syncRelearnNodeToRuntime(payload: WorkspaceRelearnNodePayload) {
  saveWorkspaceRelearnNode(payload);
}

export async function syncSoftDeleteNodesToRuntime(
  payload: { nodeIds: string[]; deletedAt: string }
): Promise<WorkspaceSoftDeleteNodesResult | undefined> {
  return softDeleteWorkspaceNodes(payload);
}

export async function syncRestoreNodesToRuntime(payload: { nodeIds: string[] }): Promise<WorkspaceRestoreNodesResult | undefined> {
  return restoreWorkspaceNodes(payload);
}

export async function syncDeleteNodesPermanentlyToRuntime(
  payload: { nodeIds: string[]; nodeOrder: string[] }
): Promise<WorkspaceDeleteNodesPermanentlyResult | undefined> {
  return deleteWorkspaceNodesPermanently(payload);
}

export function syncReadingProgressToRuntime(payload: WorkspaceReadingProgressSavePayload) {
  saveWorkspaceReadingProgress(payload);
}
