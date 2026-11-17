import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { ImageClozeDraftRegion } from '../../image-cloze/model/imageCloze';
import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import type { ImageExcerptTarget } from '../model/imageExcerptRegionSelection';

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
import { createImageAnnotationDraftButton } from './imageExcerptRegionInteractions';
import { createImageCropDraftButton } from './liveMarkdownImageCrop';
import { originalImageDraft, originalImagePoint } from './liveMarkdownImageCropFrame';
import { IMAGE_FOCUS_EVENT } from './liveMarkdownImageFocus';

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

function positionDraftActions(actions: HTMLElement, point: { x: number; y: number } | null) {
  actions.style.left = point ? `${point.x}px` : '';
  actions.style.top = point ? `${point.y}px` : '';
}

function alignPreviewActions(actions: HTMLElement, overlay: HTMLElement, point: { x: number; y: number }) {
  actions.hidden = false;
  const bounds = overlay.getBoundingClientRect();
  const x = Math.min(point.x, window.innerWidth - bounds.left - actions.offsetWidth - 18);
  const y = Math.min(window.innerHeight - bounds.top - 28, Math.max(28 - bounds.top, point.y));
  positionDraftActions(actions, { x, y });
}

export function createImageClozeDraftController(args: {
  attachmentId: string;
  keepActionsInView?: boolean;
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
    canStartDrag: (event) => !findImageRegionNearBorder(args.presentation, args.attachmentId, originalImagePoint(args.overlay, toRelativeImagePoint(args.overlay, event))),
    draftRectElement: args.draftRectElement,
    onFinalize: (anchorPoint) => {
      actionAnchorPoint = anchorPoint;
      positionDraftActions(draftActions, anchorPoint);
      if (args.keepActionsInView) alignPreviewActions(draftActions, args.overlay, anchorPoint);
    },
    overlay: args.overlay
  });
  const resetDraft = () => {
    actionAnchorPoint = null;
    draftActions.hidden = true;
    positionDraftActions(draftActions, null);
    updateDraftRectElement(args.draftRectElement, null);
  };
  const syncPendingPreview = () => {
    args.regionLayer.querySelectorAll('[data-region-pending="true"]').forEach((element) => element.remove());
    draftActions.dataset.mdImageClozeGrouping = String(pendingRegions.length > 0);
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
  annotation?: { target: ImageExcerptTarget; image: HTMLImageElement };
  overlay: HTMLElement;
  to: number;
};

function getDraftImageRange(args: ImageClozeDraftButtonArgs) {
  return args.getImageRange?.() ?? { from: args.from, to: args.to };
}

function createConfirmDraftButton(args: ImageClozeDraftButtonArgs) {
  return createImageClozeActionButton({
    ariaLabel: 'Confirm image cloze',
    iconPath: 'M3 4h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 12H3a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 3 4ZM4.7 8h.01M8 8h.01M11.3 8h.01',
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
          buildImageClozeRegionDetail({ attachmentId: args.attachmentId, draftRect: originalImageDraft(args.overlay, draftRect), from: imageRange.from, to: imageRange.to })
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
        buildImageClozeRegionDetail({ attachmentId: args.attachmentId, draftRect: originalImageDraft(args.overlay, draftRect), from: imageRange.from, to: imageRange.to })
      );
      args.draft.resetDraft();
      args.overlay.hidden = false;
    }
  });
}

function createFocusDraftButton(args: ImageClozeDraftButtonArgs) {
  const label = translate(getStoredAppLocale(), 'desktop.editor.image.focus');
  const button = createImageClozeActionButton({
    ariaLabel: label,
    iconPath: 'M2 6V2h4m4 0h4v4m0 4v4h-4m-4 0H2v-4m4-4h4v4H6z',
    onClick: event => {
      event.preventDefault();
      event.stopPropagation();
      const focus = args.draft.dragHandlers.getDraftRect();
      if (!focus || args.draft.hasPendingRegions()) return;
      args.host.dispatchEvent(new CustomEvent(IMAGE_FOCUS_EVENT, { detail: originalImageDraft(args.overlay, focus), bubbles: true }));
      args.draft.resetDraft();
    }
  });
  button.title = label;
  button.classList.add('cm-md-image-focus-action');
  return button;
}

export function appendImageClozeDraftButtons(args: ImageClozeDraftButtonArgs) {
  args.draft.draftActions.append(
    createConfirmDraftButton(args),
    createFocusDraftButton(args),
    createImageCropDraftButton(args),
    createCancelDraftButton(args),
    createAddDraftRegionButton(args)
  );
  if (args.annotation) args.draft.draftActions.append(createImageAnnotationDraftButton({ ...args.annotation,
    attachmentId: args.attachmentId, draft: args.draft, overlay: args.overlay,
    getImageRange: () => getDraftImageRange(args)
  }));
}
