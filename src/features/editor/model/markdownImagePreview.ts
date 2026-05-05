import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

export const MARKDOWN_IMAGE_PREVIEW_EVENT = 'foliole:markdown-image-preview';

export interface MarkdownImagePreviewRequest {
  alt: string;
  presentation: ImageClozeEditorPresentation | null;
  src: string;
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
