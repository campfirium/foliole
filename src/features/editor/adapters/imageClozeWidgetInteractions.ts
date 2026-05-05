import type { ImageClozeDraftRegion } from '../../image-cloze/model/imageCloze';
import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

import { attachOverlayDragHandlers, updateDraftRectElement } from './imageClozeWidgetDraft';
import {
  buildImageClozeRegionDetail,
  createImageClozeActionButton,
  dispatchImageClozeCreate,
  dispatchImageClozeDelete,
  findImageRegionNearBorder,
  showImageClozeFeedback,
  toRelativeImagePoint
} from './imageClozeWidgetInteractionHelpers';
import { createImageRegionElement, syncSavedRegionLayerState } from './imageClozeWidgetOverlayHelpers';

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
  return target instanceof Element && target.closest('.cm-md-image-cloze-actions, .cm-md-image-cloze-delete') !== null;
}

function createDeleteControl(onClick: (event: MouseEvent) => void) {
  const button = createImageClozeActionButton({
    ariaLabel: 'Delete image cloze',
    iconPath: 'M5 5.5h6 M6.2 5.5v-.8h3.6v.8 M6.8 7.2v4 M9.2 7.2v4 M5.5 5.5l.5 6.1c.1.7.3.9 1 .9h1.9c.7 0 .9-.2 1-.9l.5-6.1',
    onClick
  });
  const container = document.createElement('div');
  container.className = 'cm-md-image-cloze-delete';
  container.hidden = true;
  container.append(button);
  return { button, container };
}
function createDraftActions(args: {
  attachmentId: string;
  draftRectElement: HTMLElement;
  from: number;
  host: HTMLElement;
  overlay: HTMLElement;
  presentation?: ImageClozeEditorPresentation | null;
  regionLayer: HTMLElement;
  to: number;
}) {
  let actionAnchorPoint: { x: number; y: number } | null = null;
  let pendingRegions: ImageClozeDraftRegion[] = [];
  const draftActions = document.createElement('div');
  draftActions.className = 'cm-md-image-cloze-actions';
  draftActions.hidden = true;
  const dragHandlers = attachOverlayDragHandlers({
    actions: draftActions,
    canStartDrag: (event) => !findImageRegionNearBorder(args.presentation, args.attachmentId, toRelativeImagePoint(args.overlay, event)),
    draftRectElement: args.draftRectElement,
    onFinalize: (anchorPoint) => {
      actionAnchorPoint = anchorPoint;
      draftActions.style.left = `${anchorPoint.x}px`;
      draftActions.style.top = `${anchorPoint.y}px`;
    },
    overlay: args.overlay
  });
  const resetDraft = () => {
    actionAnchorPoint = null;
    draftActions.hidden = true;
    draftActions.style.left = '';
    draftActions.style.top = '';
    updateDraftRectElement(args.draftRectElement, null);
  };
  const syncPendingPreview = () => {
    args.regionLayer.querySelectorAll('[data-region-pending="true"]').forEach((element) => element.remove());
    for (const region of pendingRegions) {
      const preview = createImageRegionElement(region, 'outlined');
      preview.dataset.regionPending = 'true';
      args.regionLayer.append(preview);
    }
  };
  return {
    actionAnchorPoint: () => actionAnchorPoint,
    addPendingRegion(region: ImageClozeDraftRegion) {
      pendingRegions = [...pendingRegions, region];
      syncPendingPreview();
    },
    consumePendingRegions() {
      const nextRegions = [...pendingRegions];
      pendingRegions = [];
      syncPendingPreview();
      return nextRegions;
    },
    draftActions,
    dragHandlers,
    hasPendingRegions: () => pendingRegions.length > 0,
    resetDraft,
    syncPendingPreview
  };
}
function appendDraftButtons(args: {
  attachmentId: string;
  draft: ReturnType<typeof createDraftActions>;
  from: number;
  host: HTMLElement;
  overlay: HTMLElement;
  to: number;
}) {
  args.draft.draftActions.append(
    createImageClozeActionButton({
      ariaLabel: 'Confirm image cloze',
      iconPath: 'M3 8.5 6.2 11.7 13 4.8',
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const draftRect = args.draft.dragHandlers.getDraftRect();
        if (!draftRect) {
          return;
        }
        dispatchImageClozeCreate({
          attachmentId: args.attachmentId,
          imageRange: { from: args.from, to: args.to },
          regions: [...args.draft.consumePendingRegions(), buildImageClozeRegionDetail({ attachmentId: args.attachmentId, draftRect, from: args.from, to: args.to })]
        });
        const anchorPoint = args.draft.actionAnchorPoint();
        if (anchorPoint) {
          showImageClozeFeedback(args.host, 'Item created.', anchorPoint.x, anchorPoint.y);
        }
        args.draft.resetDraft();
      }
    }),
    createImageClozeActionButton({
      ariaLabel: 'Cancel image cloze',
      iconPath: 'M4 4 12 12 M12 4 4 12',
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        args.draft.resetDraft();
      }
    }),
    createImageClozeActionButton({
      ariaLabel: 'Add image cloze region',
      iconPath: 'M8 3.5v9 M3.5 8h9',
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const draftRect = args.draft.dragHandlers.getDraftRect();
        if (!draftRect) {
          return;
        }
        args.draft.addPendingRegion(buildImageClozeRegionDetail({ attachmentId: args.attachmentId, draftRect, from: args.from, to: args.to }));
        args.draft.resetDraft();
        args.overlay.hidden = false;
      }
    })
  );
}
function positionDeleteControl(deleteControl: ReturnType<typeof createDeleteControl>, anchorPoint: { x: number; y: number } | null) {
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
  draft: ReturnType<typeof createDraftActions>;
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
  deleteControl: ReturnType<typeof createDeleteControl>;
  draft: ReturnType<typeof createDraftActions>;
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
    presentation: args.presentation,
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
  const draft = createDraftActions({
    attachmentId: args.attachmentId,
    draftRectElement: args.draftRectElement,
    from: args.from,
    host,
    overlay: args.overlay,
    presentation: args.presentation,
    regionLayer: args.regionLayer,
    to: args.to
  });
  appendDraftButtons({ attachmentId: args.attachmentId, draft, from: args.from, host, overlay: args.overlay, to: args.to });
  const deleteControl = createDeleteControl((event) => {
    event.preventDefault();
    event.stopPropagation();
    selection.deleteSelection();
  });
  const selection = createSelectionHandlers({ attachmentId: args.attachmentId, deleteControl, draft, host, overlay: args.overlay, presentation: args.presentation, regionLayer: args.regionLayer });
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
