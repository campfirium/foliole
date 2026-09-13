import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import { resolveImageDisplay, type ImageIntrinsicSize } from '../model/remoteImageDisplay';

function replaceDisplayClass(element: Element, prefix: string, display: MarkdownImageMatch['display']) {
  element.classList.remove(`${prefix}-block`, `${prefix}-inline`);
  element.classList.add(`${prefix}-${display}`);
}

function applyIntrinsicSlot(surface: HTMLElement | null, display: MarkdownImageMatch['display'], size: ImageIntrinsicSize) {
  if (!surface) return;
  surface.style.aspectRatio = `${size.width} / ${size.height}`;
  if (display === 'inline') {
    surface.style.height = '1lh';
    surface.style.width = `calc(1lh * ${size.width / size.height})`;
    return;
  }
  surface.style.removeProperty('height');
  surface.style.width = `${size.width}px`;
}

export function finalizeMarkdownImageDisplay(
  widget: HTMLElement,
  imageMatch: MarkdownImageMatch,
  size: ImageIntrinsicSize,
  requestMeasure: (() => void) | null
) {
  const display = resolveImageDisplay(imageMatch.display, size, imageMatch.displayWidth);
  if (widget.dataset.mdImageFinalDisplay) return;
  widget.dataset.mdImageFinalDisplay = display;
  widget.dataset.mdImageDisplay = display;
  replaceDisplayClass(widget, 'cm-md-image-widget', display);
  const surface = widget.querySelector<HTMLElement>('.cm-md-image-surface');
  if (surface) {
    replaceDisplayClass(surface, 'cm-md-image-surface', display);
    surface.classList.toggle('group', display === 'block');
  }
  const image = widget.querySelector('.cm-md-image-element');
  if (image) replaceDisplayClass(image, 'cm-md-image-element', display);
  if (imageMatch.displayWidth) {
    if (surface) {
      surface.style.aspectRatio = `${size.width} / ${size.height}`;
      surface.style.width = `${imageMatch.displayWidth}px`;
    }
  } else {
    applyIntrinsicSlot(surface, display, size);
  }
  requestMeasure?.();
}

export function finalizeLoadedMarkdownImageDisplay(
  widget: HTMLElement,
  imageMatch: MarkdownImageMatch,
  requestMeasure: (() => void) | null
) {
  const image = widget.querySelector<HTMLImageElement>('.cm-md-image-element');
  if (!image?.naturalWidth || !image.naturalHeight) return;
  finalizeMarkdownImageDisplay(
    widget,
    imageMatch,
    { height: image.naturalHeight, width: image.naturalWidth },
    requestMeasure
  );
}

export function concealLoadingMarkdownImageSurface(surface: HTMLElement) {
  surface.classList.add('cm-md-image-surface-loading');
  surface.setAttribute('aria-hidden', 'true');
  Object.assign(surface.style, {
    height: '1px',
    opacity: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    width: '1px'
  });
}

export function revealLoadedMarkdownImageSurface(surface: HTMLElement) {
  surface.classList.remove('cm-md-image-surface-loading');
  surface.removeAttribute('aria-hidden');
  surface.removeAttribute('style');
}
