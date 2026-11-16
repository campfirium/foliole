import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import { disposeImageExcerptRegionInteractions } from './imageExcerptRegionInteractions';
import { finalizeLoadedMarkdownImageDisplay } from './liveMarkdownImageDisplay';
import { createImageSurface } from './liveMarkdownImageSurface';
import { disposeRemoteImageOnDemandLocalization } from './remoteImageOnDemandLocalization';

export function refreshMarkdownImageWidgetPresentation(
  widget: HTMLElement,
  imageMatch: MarkdownImageMatch,
  editorNodeId: string | null
) {
  const surface = widget.querySelector<HTMLElement>('.cm-md-image-surface');
  const image = surface?.querySelector<HTMLImageElement>('.cm-md-image-element');
  if (!surface || !image || surface.classList.contains('cm-md-image-surface-loading')) return false;

  const style = surface.style.cssText;
  const display = widget.classList.contains('cm-md-image-widget-block') ? 'block' : 'inline';
  const nextSurface = createImageSurface({ ...imageMatch, display }, image.getAttribute('src') ?? '', editorNodeId, {
    existingImage: image
  });
  nextSurface.style.cssText = style;
  const sameCrop = surface.dataset.mdImageCropVisible === nextSurface.dataset.mdImageCropVisible;
  if (surface.dataset.mdImageFinalDisplay && sameCrop) {
    nextSurface.dataset.mdImageFinalDisplay = surface.dataset.mdImageFinalDisplay;
  }
  disposeImageExcerptRegionInteractions(surface);
  disposeRemoteImageOnDemandLocalization(surface);
  widget.replaceChildren(nextSurface);
  if (!sameCrop) finalizeLoadedMarkdownImageDisplay(widget, imageMatch, null);
  return true;
}
