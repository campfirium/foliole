import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import { createImageStatusElement } from './liveMarkdownImageStatus';

export function createUnavailableImageStatus(
  imageMatch: MarkdownImageMatch,
  onRemoveImage: (() => void) | null
) {
  return createImageStatusElement('unavailable', imageMatch.display, {
    onRemoveImage,
    sourceUrl: imageMatch.source
  });
}
