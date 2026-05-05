import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences';
import { ASSET_MARKDOWN_SCHEME, parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { getImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

import { createImageClozeImageSurface } from './imageClozeWidgetDom';

export interface MarkdownImageMatch {
  attachmentId: string | null;
  from: number;
  to: number;
  alt: string;
  display: 'block' | 'inline';
  source: string;
}

function isRemoteImageSource(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isInternalImageSource(value: string) {
  return value.startsWith(ASSET_MARKDOWN_SCHEME);
}

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

function buildAttachmentProtocolUrl(attachmentId: string) {
  return `foliole-asset://attachment/${encodeURIComponent(attachmentId)}`;
}

function resolveImageDisplay(text: string, matchIndex: number, raw: string) {
  const before = text.slice(0, matchIndex).trim();
  const after = text.slice(matchIndex + raw.length).trim();
  return before.length === 0 && after.length === 0 ? 'block' : 'inline';
}

export function createMarkdownImageWidgetDom(imageMatch: MarkdownImageMatch, editorNodeId: string | null = null) {
  const wrapper = document.createElement('span');
  wrapper.className = imageMatch.display === 'block' ? 'cm-md-image-widget cm-md-image-widget-block' : 'cm-md-image-widget cm-md-image-widget-inline';
  wrapper.dataset.mdImageAlt = imageMatch.alt;
  wrapper.dataset.mdImageAttachmentId = imageMatch.attachmentId ?? '';
  wrapper.dataset.mdImageDisplay = imageMatch.display;
  wrapper.dataset.mdImageFrom = parseImageRange(imageMatch.from);
  wrapper.dataset.mdImageSource = imageMatch.source;
  wrapper.dataset.mdImageTo = parseImageRange(imageMatch.to);

  if (isRemoteImageSource(imageMatch.source)) {
    wrapper.append(createImageSurface(imageMatch, imageMatch.source, editorNodeId));
    return wrapper;
  }

  if (!imageMatch.attachmentId) {
    wrapper.append(createImageStatusElement('unavailable', imageMatch.display));
    return wrapper;
  }

  wrapper.append(
    createImageSurface(imageMatch, buildAttachmentProtocolUrl(imageMatch.attachmentId), editorNodeId, {
      onError: () => {
        wrapper.replaceChildren(createImageStatusElement('unavailable', imageMatch.display));
      }
    })
  );
  return wrapper;
}

export function collectImageMatches(from: number, text: string): MarkdownImageMatch[] {
  const matches: MarkdownImageMatch[] = [];
  for (const match of collectMarkdownImageReferences(text)) {
    const target = parseMarkdownImageTarget(match.rawTarget);
    const source = target?.destination ?? null;
    if (source && (isRemoteImageSource(source) || isInternalImageSource(source))) {
      const start = from + match.start;
      matches.push({
        attachmentId: isInternalImageSource(source) ? parseAssetMarkdownUrl(source) : null,
        display: resolveImageDisplay(text, match.start, match.fullMatch),
        from: start,
        to: start + match.fullMatch.length,
        alt: match.altText,
        source
      });
    }
  }
  return matches;
}
