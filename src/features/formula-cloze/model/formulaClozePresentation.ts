import type { FormulaClozePresentationRegion } from './formulaCloze';

export interface FormulaClozeEditorPresentation {
  canCreate: boolean;
  hiddenRegionIds: string[];
  outlinedRegionIds: string[];
  regions: FormulaClozePresentationRegion[];
}

const presentationByEditorNodeId = new Map<string, FormulaClozeEditorPresentation>();
export const FORMULA_CLOZE_PRESENTATION_CHANGE_EVENT = 'foliole:formula-cloze-presentation-change';

function notifyFormulaClozePresentationChanged(editorNodeId: string) {
  window.dispatchEvent(
    new CustomEvent<{ editorNodeId: string }>(FORMULA_CLOZE_PRESENTATION_CHANGE_EVENT, {
      detail: { editorNodeId }
    })
  );
}

// Each notification rebuilds every formula widget and cancels an in-progress region drag, so an
// identical re-registration stays silent.
export function registerFormulaClozeEditorPresentation(editorNodeId: string, presentation: FormulaClozeEditorPresentation) {
  const previous = presentationByEditorNodeId.get(editorNodeId);
  presentationByEditorNodeId.set(editorNodeId, presentation);
  if (previous && JSON.stringify(previous) === JSON.stringify(presentation)) return;
  notifyFormulaClozePresentationChanged(editorNodeId);
}

export function unregisterFormulaClozeEditorPresentation(editorNodeId: string) {
  presentationByEditorNodeId.delete(editorNodeId);
  notifyFormulaClozePresentationChanged(editorNodeId);
}

export function getFormulaClozeEditorPresentation(editorNodeId: string | null | undefined) {
  if (!editorNodeId) {
    return null;
  }
  return presentationByEditorNodeId.get(editorNodeId) ?? null;
}

export function getFormulaClozeAnswerEditorNodeId(editorNodeId: string | null) {
  return editorNodeId ? `${editorNodeId}::answer` : null;
}
