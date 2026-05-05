import { IMAGE_CLOZE_CREATE_EVENT, type ImageClozeCreateEventDetail } from '../../image-cloze/model/imageClozeEvents';
import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

import { attachOverlayDragHandlers, type DraftRect, updateDraftRectElement } from './imageClozeWidgetDraft';
import { createSavedRegionLayer, focusImageRegionInViewport } from './imageClozeWidgetOverlayHelpers';

function dispatchImageClozeCreateEvent(detail: ImageClozeCreateEventDetail) {
  window.dispatchEvent(new CustomEvent<ImageClozeCreateEventDetail>(IMAGE_CLOZE_CREATE_EVENT, { detail }));
}

function createIconMarkup(path: string) {
  return `<svg viewBox="0 0 16 16" aria-hidden="true" class="cm-md-image-icon"><path d="${path}"></path></svg>`;
}

function showCreatedFeedback(actions: HTMLElement, anchorPoint: { x: number; y: number }) {
  const host = actions.parentElement?.parentElement;
  if (!host) {
    return;
  }
  const existing = host.querySelector('.cm-md-image-cloze-feedback');
  existing?.remove();
  const feedback = document.createElement('div');
  feedback.className = 'cm-md-image-cloze-feedback';
  feedback.textContent = 'Item created.';
  feedback.style.left = `${anchorPoint.x}px`;
  feedback.style.top = `${anchorPoint.y}px`;
  host.append(feedback);
  window.setTimeout(() => feedback.remove(), 1400);
}

function createActionButton(args: { ariaLabel: string; iconPath: string; onClick: (event: MouseEvent) => void }) {
  const button = document.createElement('button');
  button.className = 'cm-md-image-cloze-action';
  button.setAttribute('aria-label', args.ariaLabel);
  button.innerHTML = createIconMarkup(args.iconPath);
  button.type = 'button';
  button.addEventListener('click', args.onClick);
  return button;
}

function buildImageClozeRegionDetail(args: { attachmentId: string; from: number; draftRect: DraftRect; to: number }) {
  return {
    attachmentId: args.attachmentId,
    imageRange: { from: args.from, to: args.to },
    region: {
      answer: '',
      attachmentId: args.attachmentId,
      height: args.draftRect.height,
      id: `region-${crypto.randomUUID()}`,
      width: args.draftRect.width,
      x: args.draftRect.x,
      y: args.draftRect.y
    }
  };
}

function createOverlayActions(args: {
  actions: HTMLElement;
  attachmentId: string;
  getActionAnchorPoint: () => { x: number; y: number } | null;
  closeClozeMode: () => void;
  from: number;
  getDraftRect: () => DraftRect | null;
  to: number;
}) {
  const confirmDraft = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const draftRect = args.getDraftRect();
    if (!draftRect) {
      return;
    }
    dispatchImageClozeCreateEvent(
      buildImageClozeRegionDetail({
        attachmentId: args.attachmentId,
        draftRect,
        from: args.from,
        to: args.to
      })
    );
    const anchorPoint = args.getActionAnchorPoint();
    if (anchorPoint) {
      showCreatedFeedback(args.actions, anchorPoint);
    }
    args.closeClozeMode();
  };
  args.actions.append(
    createActionButton({
      ariaLabel: 'Confirm image cloze',
      iconPath: 'M3 8.5 6.2 11.7 13 4.8',
      onClick: confirmDraft
    }),
    createActionButton({
      ariaLabel: 'Cancel image cloze',
      iconPath: 'M4 4 12 12 M12 4 4 12',
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        args.closeClozeMode();
      }
    })
  );
}

function createOverlayStateController(args: { overlay: HTMLElement; wrapper: HTMLElement; onEscape: () => void }) {
  let overlayOpen = false;

  const handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    args.onEscape();
  };

  return {
    isOpen: () => overlayOpen,
    sync(nextOpen: boolean) {
      overlayOpen = nextOpen;
      args.overlay.hidden = !nextOpen;
      args.wrapper.dataset.mdImageClozeActive = nextOpen ? 'true' : 'false';
      if (nextOpen) {
        window.addEventListener('keydown', handleEscapeKey);
        return;
      }
      window.removeEventListener('keydown', handleEscapeKey);
    }
  };
}

function createOverlaySession(args: {
  actions: HTMLElement;
  draftRectElement: HTMLElement;
  overlay: HTMLElement;
  wrapper: HTMLElement;
}) {
  let actionAnchorPoint: { x: number; y: number } | null = null;
  const resetDraft = () => {
    actionAnchorPoint = null;
    args.actions.hidden = true;
    args.actions.style.left = '';
    args.actions.style.top = '';
    updateDraftRectElement(args.draftRectElement, null);
  };
  const overlayState = createOverlayStateController({
    onEscape: () => {
      overlayState.sync(false);
      resetDraft();
    },
    overlay: args.overlay,
    wrapper: args.wrapper
  });

  return {
    getActionAnchorPoint: () => actionAnchorPoint,
    hideOverlay() {
      overlayState.sync(false);
      resetDraft();
    },
    isOpen: overlayState.isOpen,
    openOverlay() {
      overlayState.sync(true);
      resetDraft();
    },
    resetDraft,
    setActionAnchorPoint(anchorPoint: { x: number; y: number }) {
      actionAnchorPoint = anchorPoint;
      args.actions.style.left = `${anchorPoint.x}px`;
      args.actions.style.top = `${anchorPoint.y}px`;
    }
  };
}

function attachOverlayInteractions(args: {
  attachmentId: string;
  draftRectElement: HTMLElement;
  from: number;
  wrapper: HTMLElement;
  overlay: HTMLElement;
  to: number;
}) {
  const actions = document.createElement('div');
  actions.className = 'cm-md-image-cloze-actions';
  actions.hidden = true;
  args.overlay.append(actions);
  const session = createOverlaySession({
    actions,
    draftRectElement: args.draftRectElement,
    overlay: args.overlay,
    wrapper: args.wrapper
  });
  const dragHandlers = attachOverlayDragHandlers({
    actions,
    draftRectElement: args.draftRectElement,
    onFinalize: session.setActionAnchorPoint,
    overlay: args.overlay
  });
  createOverlayActions({
    actions,
    attachmentId: args.attachmentId,
    closeClozeMode: session.hideOverlay,
    from: args.from,
    getActionAnchorPoint: session.getActionAnchorPoint,
    getDraftRect: dragHandlers.getDraftRect,
    to: args.to
  });
  return {
    closeIfIdle() {
      if (session.isOpen() && (!actions.hidden || dragHandlers.getDraftRect() !== null || dragHandlers.isDragging())) {
        return;
      }
      session.hideOverlay();
    },
    openClozeMode() {
      if (session.isOpen()) {
        return;
      }
      session.openOverlay();
    }
  };
}

export function createImageClozeImageSurface(args: {
  attachmentId: string | null;
  presentation?: ImageClozeEditorPresentation | null;
  display: 'block' | 'inline';
  from: number;
  renderImage: () => HTMLImageElement;
  to: number;
}) {
  const wrapper = document.createElement('span');
  wrapper.className =
    args.display === 'inline'
      ? 'cm-md-image-surface cm-md-image-surface-inline'
      : 'cm-md-image-surface cm-md-image-surface-block';
  wrapper.append(args.renderImage());
  wrapper.append(createSavedRegionLayer(args.presentation ?? null));
  focusImageRegionInViewport(wrapper, args.presentation ?? null);
  if (!args.attachmentId) {
    return wrapper;
  }
  const overlay = document.createElement('div');
  overlay.className = 'cm-md-image-cloze-overlay';
  overlay.hidden = true;
  wrapper.append(overlay);

  const draftRectElement = document.createElement('div');
  draftRectElement.className = 'cm-md-image-cloze-draft';
  draftRectElement.hidden = true;
  overlay.append(draftRectElement);
  const controls = attachOverlayInteractions({
    attachmentId: args.attachmentId,
    draftRectElement,
    from: args.from,
    overlay,
    wrapper,
    to: args.to
  });
  if (args.presentation?.canCreate !== false) {
    wrapper.classList.add('cm-md-image-surface-clozeable');
    wrapper.dataset.mdImageClozeActive = 'false';
    wrapper.addEventListener('pointerenter', () => {
      controls.openClozeMode();
    });
    wrapper.addEventListener('pointerleave', () => {
      controls.closeIfIdle();
    });
  }

  return wrapper;
}
