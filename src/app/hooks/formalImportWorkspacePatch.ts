import type { WorkspaceNodeMutationPatchResult } from '../../shared/platform/workspaceRuntimeTypes';
import { createWorkspaceNodeMutationPatch } from '../../store/workspaceNodeMutationPatch';
import { reconcileReviewSession } from '../../store/workspaceReviewSessionSync';
import { useWorkspaceStore } from '../../store/workspaceStore';

const appliedImportPatchIds = new Set<string>();
const handledImportWorkspaceIds = new Set<string>();
const importWorkspaceRefreshes = new Map<string, Promise<void>>();

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
  importWorkspaceRefreshes.clear();
}

export async function refreshImportWorkspaceOnce(
  importId: string | null | undefined,
  refreshWorkspace: () => Promise<void>
) {
  if (!importId || handledImportWorkspaceIds.has(importId)) {
    return false;
  }
  const activeRefresh = importWorkspaceRefreshes.get(importId);
  if (activeRefresh) {
    await activeRefresh;
    return false;
  }
  const refresh = refreshWorkspace().then(() => {
    handledImportWorkspaceIds.add(importId);
  });
  importWorkspaceRefreshes.set(importId, refresh);
  try {
    await refresh;
    return true;
  } finally {
    importWorkspaceRefreshes.delete(importId);
  }
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
