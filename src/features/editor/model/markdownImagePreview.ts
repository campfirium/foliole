import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

import type { ImageFocusRect } from './markdownImageFocus';

export const MARKDOWN_IMAGE_PREVIEW_EVENT = 'foliole:markdown-image-preview';

export interface MarkdownImagePreviewRequest {
  alt: string;
  focus?: ImageFocusRect;
  presentation: ImageClozeEditorPresentation | null;
  src: string;
  mountEditor?: (host: HTMLElement, annotationHost: HTMLElement) => () => void;
}

export function dispatchMarkdownImagePreviewRequest(target: HTMLElement, detail: MarkdownImagePreviewRequest) {
  target.dispatchEvent(
    new CustomEvent<MarkdownImagePreviewRequest>(MARKDOWN_IMAGE_PREVIEW_EVENT, {
      bubbles: true,
      composed: true,
      detail
    })
  );
}
