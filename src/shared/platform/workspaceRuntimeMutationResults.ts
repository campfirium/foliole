import type { NativeCommandName } from '../../../lib/platform/nativeContract';

import { logRuntimeError } from './runtimeLogging';
import type {
  WorkspaceDeleteNodesPermanentlyResult,
  WorkspaceMoveNodesResult,
  WorkspaceNodeMutationPatchResult,
  WorkspaceRestoreNodesResult,
  WorkspaceSoftDeleteNodesResult
} from './workspaceRuntimeTypes';

export function isRestoreNodesResult(value: unknown): value is WorkspaceRestoreNodesResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as WorkspaceRestoreNodesResult).restoredNodeIds) &&
      Array.isArray((value as WorkspaceRestoreNodesResult).skippedConflicts)
  );
}

export function isSoftDeleteNodesResult(value: unknown): value is WorkspaceSoftDeleteNodesResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as WorkspaceSoftDeleteNodesResult).deletedNodeIds)
  );
}

export function isDeleteNodesPermanentlyResult(value: unknown): value is WorkspaceDeleteNodesPermanentlyResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as WorkspaceDeleteNodesPermanentlyResult).removedNodeIds) &&
      Array.isArray((value as WorkspaceDeleteNodesPermanentlyResult).nodeOrder)
  );
}

export function isMoveNodesResult(value: unknown): value is WorkspaceMoveNodesResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as WorkspaceMoveNodesResult).movedNodeIds) &&
      Array.isArray((value as WorkspaceMoveNodesResult).nodeOrder)
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNodeSnapshotLike(value: unknown) {
  return Boolean(
    isObjectRecord(value) &&
      typeof value.nodeId === 'string' &&
      typeof value.parentNodeId !== 'undefined' &&
      typeof value.kind === 'string' &&
      typeof value.title === 'string' &&
      typeof value.content === 'string' &&
      typeof value.createdAt === 'string' &&
      typeof value.updatedAt === 'string'
  );
}

function isAnchorUpdateLike(value: unknown) {
  return Boolean(
    isObjectRecord(value) &&
      typeof value.nodeId === 'string' &&
      isObjectRecord(value.anchorLink) &&
      typeof value.updatedAt === 'string'
  );
}

export function isNodeMutationPatchResult(value: unknown): value is WorkspaceNodeMutationPatchResult {
  if (!isObjectRecord(value) || !Array.isArray(value.nodes) || !value.nodes.every(isNodeSnapshotLike)) {
    return false;
  }
  return (
    (value.anchorUpdates === undefined ||
      (Array.isArray(value.anchorUpdates) && value.anchorUpdates.every(isAnchorUpdateLike))) &&
    (value.nodeOrder === undefined || isStringArray(value.nodeOrder)) &&
    (value.activeNodeId === undefined || value.activeNodeId === null || typeof value.activeNodeId === 'string') &&
    (value.createdNodeIds === undefined || isStringArray(value.createdNodeIds)) &&
    (value.updatedNodeIds === undefined || isStringArray(value.updatedNodeIds)) &&
    (value.skippedNodeIds === undefined || isStringArray(value.skippedNodeIds))
  );
}

export function isCreateNodeMutationPatchResult(value: unknown): value is WorkspaceNodeMutationPatchResult {
  return isNodeMutationPatchResult(value) && Array.isArray(value.nodeOrder);
}

export function logWorkspaceRuntimeMutationError(action: string, command: NativeCommandName, error: unknown) {
  logRuntimeError('runtime sync failed', {
    area: 'native',
    action,
    command,
    fallback: 'none',
    error
  });
}
