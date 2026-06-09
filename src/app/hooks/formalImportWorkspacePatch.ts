import type { WorkspaceNodeMutationPatchResult } from '../../shared/platform/workspaceRuntimeTypes';
import { createWorkspaceNodeMutationPatch } from '../../store/workspaceNodeMutationPatch';
import { reconcileReviewSession } from '../../store/workspaceReviewSessionSync';
import { useWorkspaceStore } from '../../store/workspaceStore';

const appliedImportPatchIds = new Set<string>();
const handledImportWorkspaceIds = new Set<string>();

export function hasAppliedImportWorkspacePatch(importId: string | null | undefined) {
  return Boolean(importId && appliedImportPatchIds.has(importId));
}

export function hasHandledImportWorkspaceChange(importId: string | null | undefined) {
  return Boolean(importId && handledImportWorkspaceIds.has(importId));
}

export function markImportWorkspaceChangeHandled(importId: string | null | undefined) {
  if (importId) {
    handledImportWorkspaceIds.add(importId);
  }
}

export function resetAppliedImportWorkspacePatches() {
  appliedImportPatchIds.clear();
  handledImportWorkspaceIds.clear();
}

export function applyImportWorkspacePatch(importId: string | null | undefined, patch: WorkspaceNodeMutationPatchResult | null | undefined) {
  if (!importId || !patch) {
    return false;
  }
  useWorkspaceStore.setState((state) => {
    const workspacePatch = createWorkspaceNodeMutationPatch(state, patch);
    const nextState = { ...state, ...workspacePatch };
    return {
      ...workspacePatch,
      reviewSession: reconcileReviewSession(nextState)
    };
  });
  appliedImportPatchIds.add(importId);
  handledImportWorkspaceIds.add(importId);
  return true;
}
