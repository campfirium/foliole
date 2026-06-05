import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import { dispatchMarkdownImagePreviewRequest } from '../model/markdownImagePreview';

import { attachImageClozeOverlayInteractions } from './imageClozeWidgetInteractions';
import { createSavedRegionLayer, focusImageRegionInViewport } from './imageClozeWidgetOverlayHelpers';

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

function createImagePreviewTrigger(args: { alt: string; presentation: ImageClozeEditorPresentation | null; source: string }) {
  const label = translate(getStoredAppLocale(), 'desktop.editorPreview.openImage');
  const button = document.createElement('button');
  button.className =
    'cm-md-image-preview-trigger absolute right-2 top-2 z-surface inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-bg-elevated/90 p-0 text-foreground shadow-panel transition-opacity hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
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
    dispatchMarkdownImagePreviewRequest(button, { alt: args.alt, presentation: args.presentation, src: args.source });
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

export function createImageClozeImageSurface(args: {
  attachmentId: string | null;
  presentation?: ImageClozeEditorPresentation | null;
  display: 'block' | 'inline';
  from: number;
  previewAlt: string;
  previewPresentation: ImageClozeEditorPresentation | null;
  previewSource: string;
  renderImage: () => HTMLImageElement;
  to: number;
}) {
  const wrapper = document.createElement('span');
  wrapper.className =
    args.display === 'inline' ? 'cm-md-image-surface cm-md-image-surface-inline' : 'cm-md-image-surface cm-md-image-surface-block';
  wrapper.dataset.mdImageHighlighted = hasWholeImageHighlight(args.presentation, args.attachmentId) ? 'true' : 'false';
  wrapper.append(args.renderImage());
  const regionLayer = createSavedRegionLayer(args.presentation ?? null);
  wrapper.append(regionLayer);
  if (args.display === 'block') {
    wrapper.append(createImagePreviewTrigger({ alt: args.previewAlt, presentation: args.previewPresentation, source: args.previewSource }));
  }
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
