export interface ImageExcerptRegionRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface ImageExcerptRegionSelection {
  attachmentId: string;
  image: HTMLImageElement;
  imageRange: { from: number; to: number };
  left: number;
  rect: ImageExcerptRegionRect;
  top: number;
}

export const IMAGE_EXCERPT_SELECTION_MODE_EVENT = 'foliole:image-excerpt-selection-mode';
export const IMAGE_EXCERPT_REGION_SELECTED_EVENT = 'foliole:image-excerpt-region-selected';

const surfaceCounts = new Map<string, number>();
let activeEditorNodeId: string | null = null;

function dispatchSelectionMode(editorNodeId: string | null) {
  activeEditorNodeId = editorNodeId;
  window.dispatchEvent(new CustomEvent(IMAGE_EXCERPT_SELECTION_MODE_EVENT, { detail: editorNodeId }));
}

export function registerImageExcerptSelectionSurface(editorNodeId: string) {
  surfaceCounts.set(editorNodeId, (surfaceCounts.get(editorNodeId) ?? 0) + 1);
  return () => {
    const nextCount = Math.max(0, (surfaceCounts.get(editorNodeId) ?? 1) - 1);
    if (nextCount === 0) {
      surfaceCounts.delete(editorNodeId);
      if (activeEditorNodeId === editorNodeId) dispatchSelectionMode(null);
      return;
    }
    surfaceCounts.set(editorNodeId, nextCount);
  };
}

export function requestImageExcerptRegionSelection(editorNodeId: string) {
  if (!surfaceCounts.has(editorNodeId)) return false;
  dispatchSelectionMode(editorNodeId);
  return true;
}

export function finishImageExcerptRegionSelection(selection: ImageExcerptRegionSelection) {
  dispatchSelectionMode(null);
  window.dispatchEvent(new CustomEvent<ImageExcerptRegionSelection>(IMAGE_EXCERPT_REGION_SELECTED_EVENT, { detail: selection }));
}

export function cancelImageExcerptRegionSelection() {
  if (activeEditorNodeId) dispatchSelectionMode(null);
}
