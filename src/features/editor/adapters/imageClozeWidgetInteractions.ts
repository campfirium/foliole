import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

import {
  appendImageClozeDraftButtons,
  createDeleteControl,
  createImageClozeDraftController,
  type ImageClozeDeleteControl,
  type ImageClozeDraftController
} from './imageClozeWidgetControls';
import {
  dispatchImageClozeDelete,
  findImageRegionNearBorder,
  showImageClozeFeedback,
  toRelativeImagePoint
} from './imageClozeWidgetInteractionHelpers';
import { syncSavedRegionLayerState } from './imageClozeWidgetOverlayHelpers';

function prunePresentationRegion(
  presentation: ImageClozeEditorPresentation | null | undefined,
  regionId: string
) {
  if (!presentation) {
    return;
  }
  presentation.regions = presentation.regions.filter((region) => region.id !== regionId);
  presentation.hiddenRegionIds = presentation.hiddenRegionIds.filter((id) => id !== regionId);
  presentation.outlinedRegionIds = presentation.outlinedRegionIds.filter((id) => id !== regionId);
  if (presentation.focusRegionId === regionId) {
    presentation.focusRegionId = null;
  }
}

function isImageClozeControlTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('.cm-md-image-cloze-actions, .cm-md-image-cloze-delete, .cm-md-image-preview-trigger') !== null;
}

function positionDeleteControl(deleteControl: ImageClozeDeleteControl, anchorPoint: { x: number; y: number } | null) {
  if (!anchorPoint) {
    deleteControl.container.hidden = true;
    return;
  }
  deleteControl.container.hidden = false;
  deleteControl.container.style.left = `${anchorPoint.x}px`;
  deleteControl.container.style.top = `${anchorPoint.y}px`;
}
function createSelectionSync(args: Pick<Parameters<typeof createSelectionHandlers>[0], 'attachmentId' | 'deleteControl' | 'overlay' | 'presentation' | 'regionLayer'>) {
  return (hoverRegionId: string | null, selectedRegionId: string | null, selectedAnchorPoint: { x: number; y: number } | null) => {
    args.overlay.dataset.mdImageRegionHover = hoverRegionId ? 'true' : 'false';
    args.overlay.hidden = false;
    syncSavedRegionLayerState(args.regionLayer, args.presentation ?? null, selectedRegionId);
    positionDeleteControl(args.deleteControl, selectedAnchorPoint);
  };
}

function createSelectionPointerHandlers(args: {
  attachmentId: string;
  draft: ImageClozeDraftController;
  overlay: HTMLElement;
  presentation?: ImageClozeEditorPresentation | null;
  setHoverRegionId: (value: string | null) => void;
  setSelected: (regionId: string | null, anchorPoint: { x: number; y: number } | null) => void;
}) {
  return {
    handlePointerDown(event: PointerEvent) {
      if (event.button !== 0 || args.draft.dragHandlers.isDragging() || isImageClozeControlTarget(event.target)) {
        return;
      }
      args.overlay.hidden = false;
      const point = toRelativeImagePoint(args.overlay, event);
      const region = findImageRegionNearBorder(args.presentation, args.attachmentId, point);
      args.setSelected(
        region?.id ?? null,
        point && region
          ? {
              x: Math.max(0, Math.min(point.width, event.clientX - args.overlay.getBoundingClientRect().left)),
              y: Math.max(0, Math.min(point.height, event.clientY - args.overlay.getBoundingClientRect().top))
            }
          : null
      );
    },
    handlePointerMove(event: PointerEvent) {
      if (args.draft.dragHandlers.isDragging() || isImageClozeControlTarget(event.target)) {
        return;
      }
      args.overlay.hidden = false;
      args.setHoverRegionId(
        findImageRegionNearBorder(args.presentation, args.attachmentId, toRelativeImagePoint(args.overlay, event))?.id ?? null
      );
    }
  };
}

function createSelectionHandlers(args: {
  attachmentId: string;
  deleteControl: ImageClozeDeleteControl;
  draft: ImageClozeDraftController;
  host: HTMLElement;
  overlay: HTMLElement;
  presentation?: ImageClozeEditorPresentation | null;
  regionLayer: HTMLElement;
}) {
  let hoverRegionId: string | null = null;
  let selectedRegionId: string | null = null;
  let selectedAnchorPoint: { x: number; y: number } | null = null;
  const syncSurface = createSelectionSync(args);
  const pointerHandlers = createSelectionPointerHandlers({
    attachmentId: args.attachmentId,
    draft: args.draft,
    overlay: args.overlay,
    ...(args.presentation !== undefined ? { presentation: args.presentation } : {}),
    setHoverRegionId: (value) => {
      hoverRegionId = value;
      args.overlay.dataset.mdImageRegionHover = hoverRegionId ? 'true' : 'false';
    },
    setSelected: (regionId, anchorPoint) => {
      selectedRegionId = regionId;
      selectedAnchorPoint = anchorPoint;
      syncSurface(hoverRegionId, selectedRegionId, selectedAnchorPoint);
    }
  });
  return {
    clearHover() {
      hoverRegionId = null;
      if (!args.draft.dragHandlers.isDragging()) {
        args.overlay.dataset.mdImageRegionHover = 'false';
      }
    },
    deleteSelection() {
      if (!selectedRegionId) {
        return;
      }
      const deletedRegionId = selectedRegionId;
      dispatchImageClozeDelete({ attachmentId: args.attachmentId, regionId: selectedRegionId });
      prunePresentationRegion(args.presentation ?? null, deletedRegionId);
      const anchorPoint = args.draft.actionAnchorPoint();
      if (anchorPoint) {
        showImageClozeFeedback(args.host, 'Item deleted.', anchorPoint.x, anchorPoint.y);
      }
      args.regionLayer.querySelector(`.cm-md-image-cloze-region[data-region-id="${deletedRegionId}"]`)?.remove();
      selectedRegionId = null;
      selectedAnchorPoint = null;
      syncSurface(hoverRegionId, selectedRegionId, selectedAnchorPoint);
    },
    handlePointerDown: pointerHandlers.handlePointerDown,
    handlePointerMove: pointerHandlers.handlePointerMove,
    showOverlay() {
      args.overlay.hidden = false;
      syncSurface(hoverRegionId, selectedRegionId, selectedAnchorPoint);
    }
  };
}
export function attachImageClozeOverlayInteractions(args: {
  attachmentId: string;
  draftRectElement: HTMLElement;
  from: number;
  overlay: HTMLElement;
  presentation?: ImageClozeEditorPresentation | null;
  regionLayer: HTMLElement;
  to: number;
  wrapper: HTMLElement;
}) {
  const host = args.overlay.parentElement ?? args.wrapper;
  const draft = createImageClozeDraftController({
    attachmentId: args.attachmentId,
    draftRectElement: args.draftRectElement,
    from: args.from,
    overlay: args.overlay,
    ...(args.presentation !== undefined ? { presentation: args.presentation } : {}),
    regionLayer: args.regionLayer,
    to: args.to
  });
  appendImageClozeDraftButtons({ attachmentId: args.attachmentId, draft, from: args.from, host, overlay: args.overlay, to: args.to });
  const deleteControl = createDeleteControl((event) => {
    event.preventDefault();
    event.stopPropagation();
    selection.deleteSelection();
  });
  const selection = createSelectionHandlers({
    attachmentId: args.attachmentId,
    deleteControl,
    draft,
    host,
    overlay: args.overlay,
    ...(args.presentation !== undefined ? { presentation: args.presentation } : {}),
    regionLayer: args.regionLayer
  });
  for (const regionElement of Array.from(args.regionLayer.querySelectorAll<HTMLElement>('.cm-md-image-cloze-region'))) {
    regionElement.addEventListener('pointerdown', selection.handlePointerDown);
    regionElement.addEventListener('pointermove', selection.handlePointerMove);
  }
  args.overlay.append(draft.draftActions, deleteControl.container);
  return {
    clearHover: selection.clearHover,
    handlePointerDown: selection.handlePointerDown,
    handlePointerMove: selection.handlePointerMove,
    handlePointerLeave() {
      selection.clearHover();
      if (!draft.hasPendingRegions()) {
        draft.resetDraft();
      }
      draft.syncPendingPreview();
    },
    showOverlay: selection.showOverlay
  };
}
