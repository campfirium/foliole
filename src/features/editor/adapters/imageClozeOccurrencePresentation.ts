import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

export function selectImageClozeOccurrencePresentation(
  presentation: ImageClozeEditorPresentation | null,
  imageMatch: MarkdownImageMatch
) {
  if (!presentation || !imageMatch.attachmentId) {
    return null;
  }
  const regions = presentation.regions.filter((region) =>
    region.attachmentId === imageMatch.attachmentId &&
    (!region.imageRange || region.imageRange.from === imageMatch.from && region.imageRange.to === imageMatch.to)
  );
  return regions.length > 0 ? { ...presentation, regions } : null;
}
