import { definedProps } from '../shared/lib/definedProps';
import type { CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';

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
      payload,
      snapshot: workspaceSync.state.workspace_snapshot,
      ...definedProps({ note })
    });
    if (!result) {
      return null;
    }
    await workspaceSync.replaceSnapshot(result.snapshot, payload.parentNodeId);
    return result.nodeId;
  };
}

export function createCompanionExistingHighlightNoteHandler(workspaceSync: ReturnTypeOfUseCompanionWorkspaceSync) {
  return async (nodeId: string, originalText: string, note: string, guard?: CompanionHighlightReadGuard) => {
    const result = await addNoteToCompanionExistingHighlight({
      deviceId: workspaceSync.bootstrapState.device_id,
      nodeId,
      ...definedProps({ guard }),
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
  return async (nodeId: string, guard?: CompanionHighlightReadGuard) => {
    const result = await deleteCompanionExistingHighlight({
      deviceId: workspaceSync.bootstrapState.device_id,
      nodeId,
      ...definedProps({ guard }),
      snapshot: workspaceSync.state.workspace_snapshot
    });
    if (!result) return null;
    await workspaceSync.replaceSnapshot(result.snapshot, result.nodeId);
    return result.nodeId;
  };
}
