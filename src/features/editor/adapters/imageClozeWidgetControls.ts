import type { ImageClozeDraftRegion } from '../../image-cloze/model/imageCloze';
import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

import { attachOverlayDragHandlers, updateDraftRectElement } from './imageClozeWidgetDraft';
import {
  buildImageClozeRegionDetail,
  createImageClozeActionButton,
  dispatchImageClozeCreate,
  findImageRegionNearBorder,
  showImageClozeFeedback,
  toRelativeImagePoint
} from './imageClozeWidgetInteractionHelpers';
import { createImageRegionElement } from './imageClozeWidgetOverlayHelpers';

export interface ImageClozeDeleteControl {
  button: HTMLButtonElement;
  container: HTMLDivElement;
}

export interface ImageClozeDraftController {
  actionAnchorPoint: () => { x: number; y: number } | null;
  addPendingRegion: (region: ImageClozeDraftRegion) => void;
  consumePendingRegions: () => ImageClozeDraftRegion[];
  draftActions: HTMLDivElement;
  dragHandlers: ReturnType<typeof attachOverlayDragHandlers>;
  hasPendingRegions: () => boolean;
  resetDraft: () => void;
  syncPendingPreview: () => void;
}

export function createDeleteControl(onClick: (event: MouseEvent) => void): ImageClozeDeleteControl {
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

export function createImageClozeDraftController(args: {
  attachmentId: string;
  draftRectElement: HTMLElement;
  from: number;
  overlay: HTMLElement;
  presentation?: ImageClozeEditorPresentation | null;
  regionLayer: HTMLElement;
  to: number;
}): ImageClozeDraftController {
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

type ImageClozeDraftButtonArgs = {
  attachmentId: string;
  draft: ImageClozeDraftController;
  from: number;
  getImageRange?: () => { from: number; to: number };
  host: HTMLElement;
  overlay: HTMLElement;
  to: number;
};

function getDraftImageRange(args: ImageClozeDraftButtonArgs) {
  return args.getImageRange?.() ?? { from: args.from, to: args.to };
}

function createConfirmDraftButton(args: ImageClozeDraftButtonArgs) {
  return createImageClozeActionButton({
    ariaLabel: 'Confirm image cloze',
    iconPath: 'M3 8.5 6.2 11.7 13 4.8',
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      const draftRect = args.draft.dragHandlers.getDraftRect();
      if (!draftRect) {
        return;
      }
      const imageRange = getDraftImageRange(args);
      dispatchImageClozeCreate({
        attachmentId: args.attachmentId,
        imageRange,
        regions: [
          ...args.draft.consumePendingRegions(),
          buildImageClozeRegionDetail({ attachmentId: args.attachmentId, draftRect, from: imageRange.from, to: imageRange.to })
        ]
      });
      const anchorPoint = args.draft.actionAnchorPoint();
      if (anchorPoint) {
        showImageClozeFeedback(args.host, 'Item created.', anchorPoint.x, anchorPoint.y);
      }
      args.draft.resetDraft();
    }
  });
}

function createCancelDraftButton(args: Pick<ImageClozeDraftButtonArgs, 'draft'>) {
  return createImageClozeActionButton({
    ariaLabel: 'Cancel image cloze',
    iconPath: 'M4 4 12 12 M12 4 4 12',
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      args.draft.resetDraft();
    }
  });
}

function createAddDraftRegionButton(args: ImageClozeDraftButtonArgs) {
  return createImageClozeActionButton({
    ariaLabel: 'Add image cloze region',
    iconPath: 'M8 3.5v9 M3.5 8h9',
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      const draftRect = args.draft.dragHandlers.getDraftRect();
      if (!draftRect) {
        return;
      }
      const imageRange = getDraftImageRange(args);
      args.draft.addPendingRegion(
        buildImageClozeRegionDetail({ attachmentId: args.attachmentId, draftRect, from: imageRange.from, to: imageRange.to })
      );
      args.draft.resetDraft();
      args.overlay.hidden = false;
    }
  });
}

export function appendImageClozeDraftButtons(args: ImageClozeDraftButtonArgs) {
  args.draft.draftActions.append(
    createConfirmDraftButton(args),
    createCancelDraftButton(args),
    createAddDraftRegionButton(args)
  );
}
