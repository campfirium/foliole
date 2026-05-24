import type { NativeCommandName } from '../../../lib/platform/nativeContract';

import { logRuntimeError } from './runtimeLogging';
import type {
  WorkspaceDeleteNodesPermanentlyResult,
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

export function logWorkspaceRuntimeMutationError(action: string, command: NativeCommandName, error: unknown) {
  logRuntimeError('runtime sync failed', {
    area: 'native',
    action,
    command,
    fallback: 'none',
    error
  });
}
