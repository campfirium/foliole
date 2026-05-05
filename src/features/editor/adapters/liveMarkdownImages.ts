import { getImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import { buildMarkdownImageRenderPlan } from '../model/markdownImagePresentation';

import { createImageClozeImageSurface } from './imageClozeWidgetDom';

function parseImageRange(value: number) {
  return Number.isInteger(value) && value >= 0 ? String(value) : '';
}

function createImageElement(args: {
  alt: string;
  display: MarkdownImageMatch['display'];
  onError?: (() => void) | null;
  source: string;
}) {
  const image = document.createElement('img');
  image.alt = args.alt || 'Markdown image';
  image.src = args.source;
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.className =
    args.display === 'inline' ? 'cm-md-image-element cm-md-image-element-inline' : 'cm-md-image-element cm-md-image-element-block';
  if (args.onError) {
    image.addEventListener('error', args.onError, { once: true });
  }
  return image;
}

function createImageSurface(
  imageMatch: MarkdownImageMatch,
  source: string,
  editorNodeId: string | null = null,
  imageOptions: { onError?: (() => void) | null } = {}
) {
  const presentation = getImageClozeEditorPresentation(editorNodeId);
  const imagePresentation =
    presentation && imageMatch.attachmentId && presentation.regions.some((region) => region.attachmentId === imageMatch.attachmentId)
      ? {
          ...presentation,
          regions: presentation.regions.filter((region) => region.attachmentId === imageMatch.attachmentId)
        }
      : null;
  return createImageClozeImageSurface({
    attachmentId: imageMatch.attachmentId,
    display: imageMatch.display,
    from: imageMatch.from,
    presentation: imagePresentation,
    renderImage: () =>
      createImageElement({
        alt: imageMatch.alt,
        display: imageMatch.display,
        onError: imageOptions.onError ?? null,
        source
      }),
    previewAlt: imageMatch.alt,
    previewPresentation: imagePresentation,
    previewSource: source,
    to: imageMatch.to
  });
}

function createImageStatusElement(status: 'loading' | 'unavailable', display: MarkdownImageMatch['display']) {
  const element = document.createElement('span');
  element.className = display === 'inline' ? 'cm-md-image-status cm-md-image-status-inline' : 'cm-md-image-status cm-md-image-status-block';
  element.dataset.mdImageStatus = status;
  element.textContent = status === 'loading' ? 'Loading image…' : 'Image unavailable';
  return element;
}

export function createMarkdownImageWidgetDom(imageMatch: MarkdownImageMatch, editorNodeId: string | null = null) {
  const renderPlan = buildMarkdownImageRenderPlan(imageMatch);
  const wrapper = document.createElement('span');
  wrapper.className = imageMatch.display === 'block' ? 'cm-md-image-widget cm-md-image-widget-block' : 'cm-md-image-widget cm-md-image-widget-inline';
  wrapper.dataset.mdImageAlt = imageMatch.alt;
  wrapper.dataset.mdImageAttachmentId = imageMatch.attachmentId ?? '';
  wrapper.dataset.mdImageDisplay = imageMatch.display;
  wrapper.dataset.mdImageFrom = parseImageRange(imageMatch.from);
  wrapper.dataset.mdImageSource = imageMatch.source;
  wrapper.dataset.mdImageTo = parseImageRange(imageMatch.to);

  if (renderPlan.isRemote && renderPlan.imageSrc) {
    wrapper.append(createImageSurface(imageMatch, renderPlan.imageSrc, editorNodeId));
    return wrapper;
  }

  if (renderPlan.fallbackStatus) {
    wrapper.append(createImageStatusElement(renderPlan.fallbackStatus, renderPlan.display));
    return wrapper;
  }

  const attachmentSrc = renderPlan.attachmentProtocolSrc;
  if (!attachmentSrc) {
    wrapper.append(createImageStatusElement('unavailable', renderPlan.display));
    return wrapper;
  }

  wrapper.append(
    createImageSurface(imageMatch, attachmentSrc, editorNodeId, {
      onError: () => {
        wrapper.replaceChildren(createImageStatusElement('unavailable', renderPlan.display));
      }
    })
  );
  return wrapper;
}
