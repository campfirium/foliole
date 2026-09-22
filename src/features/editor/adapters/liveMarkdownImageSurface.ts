import { getImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import { selectImageClozeOccurrencePresentation } from './imageClozeOccurrencePresentation';
import { createImageClozeImageSurface } from './imageClozeWidgetDom';
import { createMarkdownImageElement, type RequestEditorMeasure } from './liveMarkdownImageElement';
import { attachRemoteImageOnDemandLocalization } from './remoteImageOnDemandLocalization';

export function createImageSurface(
  imageMatch: MarkdownImageMatch,
  source: string,
  editorNodeId: string | null = null,
  imageOptions: {
    deferSource?: boolean;
    onError?: (() => void) | null;
    onLoad?: (() => void) | null;
    requestMeasure?: RequestEditorMeasure;
    isActive?: () => boolean;
  } = {}
) {
  const presentation = getImageClozeEditorPresentation(editorNodeId);
  const imagePresentation = selectImageClozeOccurrencePresentation(presentation, imageMatch);
  const surface = createImageClozeImageSurface({
    attachmentId: imageMatch.attachmentId,
    display: imageMatch.display,
    ...(imageMatch.displayWidth ? { displayWidth: imageMatch.displayWidth } : {}),
    editorNodeId,
    from: imageMatch.from,
    presentation: imagePresentation,
    renderImage: () => createMarkdownImageElement({
      alt: imageMatch.alt,
      deferSource: imageOptions.deferSource ?? false,
      display: imageMatch.display,
      ...(imageMatch.linkHref ? { linkHref: imageMatch.linkHref } : {}),
      onError: imageOptions.onError ?? null,
      onLoad: imageOptions.onLoad ?? null,
      requestMeasure: imageOptions.requestMeasure ?? null,
      source,
      ...(imageOptions.isActive ? { isActive: imageOptions.isActive } : {})
    }),
    previewAlt: imageMatch.alt,
    previewPresentation: imagePresentation,
    previewSource: source,
    to: imageMatch.to
  });
  if (!imageMatch.attachmentId && editorNodeId && /^https?:\/\//u.test(imageMatch.source)) {
    attachRemoteImageOnDemandLocalization(surface, editorNodeId, imageMatch);
  }
  return surface;
}
