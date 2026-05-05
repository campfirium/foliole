import {
  addNoteToCompanionExistingHighlight,
  deleteCompanionExistingHighlight,
  persistCompanionSelectionAnnotation
} from './companionSelectionAnnotationActions';
import type { CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

import type { SelectionAnnotationPayload } from '@/shared/selectionAnnotationActions';

type ReturnTypeOfUseCompanionWorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

export function createCompanionSelectionAnnotationHandler(workspaceSync: ReturnTypeOfUseCompanionWorkspaceSync) {
  return async (kind: CompanionSelectionAnnotationKind, payload: SelectionAnnotationPayload, note?: string) => {
    const result = await persistCompanionSelectionAnnotation({
      deviceId: workspaceSync.bootstrapState.device_id,
      kind,
      note,
      payload,
      snapshot: workspaceSync.state.workspace_snapshot
    });
    if (!result) {
      return null;
    }
    await workspaceSync.replaceSnapshot(result.snapshot, result.nodeId);
    return result.nodeId;
  };
}

export function createCompanionExistingHighlightNoteHandler(workspaceSync: ReturnTypeOfUseCompanionWorkspaceSync) {
  return async (nodeId: string, originalText: string, note: string) => {
    const result = await addNoteToCompanionExistingHighlight({
      deviceId: workspaceSync.bootstrapState.device_id,
      nodeId,
      note,
      originalText,
      snapshot: workspaceSync.state.workspace_snapshot
    });
    if (!result) return null;
    await workspaceSync.replaceSnapshot(result.snapshot, result.nodeId);
    return result.nodeId;
  };
}

export function createCompanionExistingHighlightDeleteHandler(workspaceSync: ReturnTypeOfUseCompanionWorkspaceSync) {
  return async (nodeId: string) => {
    const result = await deleteCompanionExistingHighlight({
      deviceId: workspaceSync.bootstrapState.device_id,
      nodeId,
      snapshot: workspaceSync.state.workspace_snapshot
    });
    if (!result) return null;
    await workspaceSync.replaceSnapshot(result.snapshot, result.nodeId);
    return result.nodeId;
  };
}
