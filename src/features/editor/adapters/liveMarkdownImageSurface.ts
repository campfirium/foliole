import { getImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import type { ImageExcerptTarget } from '../model/imageExcerptRegionSelection';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import { selectImageClozeOccurrencePresentation } from './imageClozeOccurrencePresentation';
import { createImageClozeImageSurface } from './imageClozeWidgetDom';
import { createMarkdownImageElement, type RequestEditorMeasure } from './liveMarkdownImageElement';
import { attachRemoteImageOnDemandLocalization } from './remoteImageOnDemandLocalization';

function needsFullImageForReview(presentation: ReturnType<typeof selectImageClozeOccurrencePresentation>) {
  return presentation?.showFullImage && presentation.regions.length > 0;
}

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
    existingImage?: HTMLImageElement;
    annotationTarget?: ImageExcerptTarget;
  } = {}
) {
  const presentation = getImageClozeEditorPresentation(editorNodeId);
  const imagePresentation = selectImageClozeOccurrencePresentation(presentation, imageMatch);
  if (imagePresentation && imageOptions.annotationTarget) delete imagePresentation.onOpenNode;
  const surface = createImageClozeImageSurface({
    attachmentId: imageMatch.attachmentId,
    ...(imageOptions.annotationTarget ? { annotationTarget: imageOptions.annotationTarget } : {}),
    display: imageMatch.display,
    ...(imageMatch.crop && !needsFullImageForReview(imagePresentation) ? { crop: imageMatch.crop } : {}),
    ...(imageMatch.displayWidth ? { displayWidth: imageMatch.displayWidth } : {}),
    editorNodeId,
    ...(imageMatch.focus ? { focus: imageMatch.focus } : {}),
    from: imageMatch.from,
    presentation: imagePresentation,
    renderImage: () => imageOptions.existingImage ?? createMarkdownImageElement({
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
    to: imageMatch.to
  });
  if (!imageMatch.attachmentId && editorNodeId && /^https?:\/\//u.test(imageMatch.source)) {
    attachRemoteImageOnDemandLocalization(surface, editorNodeId, imageMatch);
  }
  return surface;
}
