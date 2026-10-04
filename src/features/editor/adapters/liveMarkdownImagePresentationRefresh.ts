import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import { disposeImageExcerptRegionInteractions } from './imageExcerptRegionInteractions';
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
  const nextSurface = createImageSurface(imageMatch, image.getAttribute('src') ?? '', editorNodeId, {
    existingImage: image
  });
  nextSurface.style.cssText = style;
  disposeImageExcerptRegionInteractions(surface);
  disposeRemoteImageOnDemandLocalization(surface);
  widget.replaceChildren(nextSurface);
  return true;
}
