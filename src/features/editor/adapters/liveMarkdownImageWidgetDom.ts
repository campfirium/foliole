import type { MarkdownImageMatch } from '../model/markdownImageMatches';

function parseImageRange(value: number) {
  return Number.isInteger(value) && value >= 0 ? String(value) : '';
}

export function updateMarkdownImageWidgetDomRange(wrapper: HTMLElement, imageMatch: MarkdownImageMatch) {
  wrapper.dataset.mdImageFrom = parseImageRange(imageMatch.from);
  wrapper.dataset.mdImageTo = parseImageRange(imageMatch.to);
}

export function setMarkdownImageWidgetDomIdentity(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  editorNodeId: string | null,
  presentationVersion: number
) {
  wrapper.dataset.mdImageAlt = imageMatch.alt;
  wrapper.dataset.mdImageAttachmentId = imageMatch.attachmentId ?? '';
  wrapper.dataset.mdImageDisplay = imageMatch.display;
  wrapper.dataset.mdImageDisplayWidth = imageMatch.displayWidth ? String(imageMatch.displayWidth) : '';
  wrapper.dataset.mdImageEditorNodeId = editorNodeId ?? '';
  wrapper.dataset.mdImageLinkHref = imageMatch.linkHref ?? '';
  wrapper.dataset.mdImagePresentationVersion = String(presentationVersion);
  wrapper.dataset.mdImageSource = imageMatch.source;
}

export function canReuseMarkdownImageWidgetDom(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  editorNodeId: string | null,
  presentationVersion: number
) {
  return (
    wrapper.dataset.mdImageAlt === imageMatch.alt &&
    wrapper.dataset.mdImageAttachmentId === (imageMatch.attachmentId ?? '') &&
    wrapper.dataset.mdImageDisplay === imageMatch.display &&
    wrapper.dataset.mdImageDisplayWidth === (imageMatch.displayWidth ? String(imageMatch.displayWidth) : '') &&
    wrapper.dataset.mdImageEditorNodeId === (editorNodeId ?? '') &&
    wrapper.dataset.mdImageLinkHref === (imageMatch.linkHref ?? '') &&
    wrapper.dataset.mdImagePresentationVersion === String(presentationVersion) &&
    wrapper.dataset.mdImageSource === imageMatch.source
  );
}
