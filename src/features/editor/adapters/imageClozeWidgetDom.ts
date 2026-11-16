import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import type { ImageFocusRect } from '../model/markdownImageFocus';
import { dispatchMarkdownImagePreviewRequest } from '../model/markdownImagePreview';

import { attachImageClozeOverlayInteractions } from './imageClozeWidgetInteractions';
import { createSavedRegionLayer, focusImageRegionInViewport } from './imageClozeWidgetOverlayHelpers';
import { attachImageExcerptRegionInteractions } from './imageExcerptRegionInteractions';
import { createImageCropEditButton } from './liveMarkdownImageCrop';
import { createImageCropPlane, setImageOverlayCrop } from './liveMarkdownImageCropFrame';
import { createImageFocusMask } from './liveMarkdownImageFocus';

function isWholeImageHighlightRegion(region: { height: number; width: number; x: number; y: number }) {
  return region.x <= 0.001 && region.y <= 0.001 && region.width >= 0.999 && region.height >= 0.999;
}

function hasWholeImageHighlight(presentation: ImageClozeEditorPresentation | null | undefined, attachmentId: string | null) {
  if (!presentation || !attachmentId) {
    return false;
  }
  const outlinedRegionIds = new Set(presentation.outlinedRegionIds);
  return presentation.regions.some(
    (region) =>
      region.attachmentId === attachmentId && outlinedRegionIds.has(region.id) && isWholeImageHighlightRegion(region)
  );
}

function createImagePreviewTrigger(args: { alt: string; image: HTMLImageElement; presentation: ImageClozeEditorPresentation | null; focus?: ImageFocusRect }) {
  const label = translate(getStoredAppLocale(), 'desktop.editorPreview.openImage');
  const button = document.createElement('button');
  button.className =
    'cm-md-image-preview-trigger absolute right-2 top-2 z-surface inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-[var(--app-control-border-color)] bg-[var(--app-surface-control-bg)] p-0 text-foreground shadow-control transition-opacity hover:border-[var(--app-control-border-hover-color)] hover:bg-[var(--app-surface-control-hover-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true" class="cm-md-image-icon"><path d="M3.75 6V3.75H6M10 3.75h2.25V6M12.25 10v2.25H10M6 12.25H3.75V10M3.75 3.75l3 3M12.25 3.75l-3 3M12.25 12.25l-3-3M3.75 12.25l3-3"></path></svg>';
  button.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  button.addEventListener('pointerup', (event) => {
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const src = args.image.currentSrc || args.image.getAttribute('src');
    if (src) dispatchMarkdownImagePreviewRequest(button, { alt: args.alt, presentation: args.presentation, ...(args.focus ? { focus: args.focus } : {}), src });
  });
  return button;
}

function parseImageRangeValue(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveCurrentImageRange(wrapper: HTMLElement, fallback: { from: number; to: number }) {
  const widget = wrapper.closest<HTMLElement>('.cm-md-image-widget');
  if (!widget) {
    return fallback;
  }
  return {
    from: parseImageRangeValue(widget.dataset.mdImageFrom, fallback.from),
    to: parseImageRangeValue(widget.dataset.mdImageTo, fallback.to)
  };
}

function attachImageExcerptSelection(args: {
  attachmentId: string | null;
  draftRectElement: HTMLElement;
  editorNodeId?: string | null;
  from: number;
  image: HTMLImageElement;
  overlay: HTMLElement;
  surface: HTMLElement;
  to: number;
}) {
  if (!args.attachmentId || !args.editorNodeId) return;
  attachImageExcerptRegionInteractions({
    attachmentId: args.attachmentId,
    draftRectElement: args.draftRectElement,
    editorNodeId: args.editorNodeId,
    from: args.from,
    getImageRange: () => resolveCurrentImageRange(args.surface, { from: args.from, to: args.to }),
    image: args.image,
    overlay: args.overlay,
    surface: args.surface,
    to: args.to
  });
}

function createImageRegionOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'cm-md-image-cloze-overlay';
  overlay.hidden = true;
  const draftRectElement = document.createElement('div');
  draftRectElement.className = 'cm-md-image-cloze-draft';
  draftRectElement.hidden = true;
  overlay.append(draftRectElement);
  return { draftRectElement, overlay };
}

function createImageSurfaceWrapper(args: {
  attachmentId: string | null;
  display: 'block' | 'inline';
  displayWidth?: number;
  presentation?: ImageClozeEditorPresentation | null;
}) {
  const wrapper = document.createElement('span');
  wrapper.className = args.display === 'inline'
    ? 'cm-md-image-surface cm-md-image-surface-inline'
    : 'cm-md-image-surface cm-md-image-surface-block group';
  wrapper.dataset.mdImageHighlighted = hasWholeImageHighlight(args.presentation, args.attachmentId) ? 'true' : 'false';
  if (args.display === 'block' && args.displayWidth) wrapper.style.width = `${args.displayWidth}px`;
  return wrapper;
}

interface ImageClozeImageSurfaceArgs {
  attachmentId: string | null;
  presentation?: ImageClozeEditorPresentation | null;
  display: 'block' | 'inline';
  displayWidth?: number;
  editorNodeId?: string | null;
  crop?: ImageFocusRect;
  focus?: ImageFocusRect;
  from: number;
  previewAlt: string;
  previewPresentation: ImageClozeEditorPresentation | null;
  renderImage: () => HTMLImageElement;
  to: number;
}

export function createImageClozeImageSurface(args: ImageClozeImageSurfaceArgs) {
  const wrapper = createImageSurfaceWrapper(args);
  const image = args.renderImage();
  const plane = args.crop ? createImageCropPlane(wrapper, args.crop) : wrapper;
  plane.append(image);
  if (args.focus) plane.append(createImageFocusMask(args.focus));
  const regionLayer = createSavedRegionLayer(args.presentation ?? null);
  plane.append(regionLayer);
  if (args.crop) wrapper.append(createImageCropEditButton(args.crop));
  wrapper.append(createImagePreviewTrigger({ alt: args.previewAlt, image, presentation: args.previewPresentation, ...(args.focus ? { focus: args.focus } : {}) }));
  focusImageRegionInViewport(wrapper, args.presentation ?? null);
  if (!args.attachmentId) {
    return wrapper;
  }

  const { draftRectElement, overlay } = createImageRegionOverlay();
  wrapper.append(overlay);
  if (args.crop) setImageOverlayCrop(overlay, args.crop);

  attachImageExcerptSelection({
    attachmentId: args.attachmentId,
    draftRectElement,
    ...(args.editorNodeId !== undefined ? { editorNodeId: args.editorNodeId } : {}),
    from: args.from,
    image,
    overlay,
    surface: wrapper,
    to: args.to
  });

  if (args.presentation?.canCreate !== false) {
    wrapper.classList.add('cm-md-image-surface-clozeable');
    wrapper.dataset.mdImageClozeActive = 'false';
    const controls = attachImageClozeOverlayInteractions({
      attachmentId: args.attachmentId,
      draftRectElement,
      from: args.from,
      getImageRange: () => resolveCurrentImageRange(wrapper, { from: args.from, to: args.to }),
      overlay,
      ...(args.presentation !== undefined ? { presentation: args.presentation } : {}),
      regionLayer,
      to: args.to,
      wrapper
    });
    wrapper.addEventListener('pointerdown', controls.handlePointerDown, { capture: true });
    wrapper.addEventListener('pointermove', controls.handlePointerMove, { capture: true });
    wrapper.addEventListener('pointerenter', controls.showOverlay);
    wrapper.addEventListener('pointerleave', controls.handlePointerLeave);
  }

  return wrapper;
}
