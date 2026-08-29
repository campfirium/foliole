import type { ImageClozeLocator } from './imageCloze';

export interface ImageClozeEditorPresentation {
  canCreate: boolean;
  focusRegionId?: string | null;
  outlinedRegionIds: string[];
  onOpenNode?: (nodeId: string) => void;
  regions: Array<ImageClozeLocator & {
    id: string;
    imageRange?: { from: number; to: number };
    openNodeId?: string;
  }>;
  hiddenRegionIds: string[];
}

const presentationByEditorNodeId = new Map<string, ImageClozeEditorPresentation>();
export const IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT = 'foliole:image-cloze-presentation-change';

function notifyImageClozePresentationChanged(editorNodeId: string) {
  window.dispatchEvent(
    new CustomEvent<{ editorNodeId: string }>(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, {
      detail: { editorNodeId }
    })
  );
}

export function registerImageClozeEditorPresentation(editorNodeId: string, presentation: ImageClozeEditorPresentation) {
  presentationByEditorNodeId.set(editorNodeId, presentation);
  notifyImageClozePresentationChanged(editorNodeId);
}

export function unregisterImageClozeEditorPresentation(editorNodeId: string) {
  presentationByEditorNodeId.delete(editorNodeId);
  notifyImageClozePresentationChanged(editorNodeId);
}

export function getImageClozeEditorPresentation(editorNodeId: string | null | undefined) {
  if (!editorNodeId) {
    return null;
  }
  return presentationByEditorNodeId.get(editorNodeId) ?? null;
}

export function getImageClozeAnswerEditorNodeId(editorNodeId: string | null) {
  return editorNodeId ? `${editorNodeId}::answer` : null;
}
