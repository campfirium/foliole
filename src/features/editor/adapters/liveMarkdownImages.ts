import { ASSET_MARKDOWN_SCHEME } from '../../../../lib/platform/assetMarkdownUrl';
import { resolveRuntimeAttachmentResource } from '../../../shared/platform/attachmentResources';

const INLINE_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\n]+)\)/g;

export interface MarkdownImageMatch {
  from: number;
  to: number;
  alt: string;
  source: string;
}

function parseMarkdownImageTarget(target: string) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return null;
  }

  if (trimmedTarget.startsWith('<')) {
    const closingIndex = trimmedTarget.indexOf('>');
    if (closingIndex > 0) {
      return trimmedTarget.slice(1, closingIndex);
    }
  }

  const match = /^(\S+)(?:\s+.+)?$/.exec(trimmedTarget);
  return match?.[1] ?? null;
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

function createImageElement(alt: string, source: string) {
  const image = document.createElement('img');
  image.alt = alt || 'Markdown image';
  image.src = source;
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.className = 'cm-md-image-element';
  return image;
}

function createImageStatusElement(status: 'loading' | 'unavailable') {
  const element = document.createElement('span');
  element.className = 'cm-md-image-status';
  element.dataset.mdImageStatus = status;
  element.textContent = status === 'loading' ? 'Loading image…' : 'Image unavailable';
  return element;
}

async function renderInternalImage(wrapper: HTMLElement, alt: string, source: string) {
  const resolution = await resolveRuntimeAttachmentResource(source);
  if (resolution?.status === 'ready' && resolution.resource_url) {
    wrapper.replaceChildren(createImageElement(alt, resolution.resource_url));
    return;
  }
  wrapper.replaceChildren(createImageStatusElement('unavailable'));
}

export function createMarkdownImageWidgetDom(alt: string, source: string) {
  const wrapper = document.createElement('span');
  wrapper.className = 'cm-md-image-widget';

  if (isRemoteImageSource(source)) {
    wrapper.append(createImageElement(alt, source));
    return wrapper;
  }

  wrapper.append(createImageStatusElement('loading'));
  void renderInternalImage(wrapper, alt, source);
  return wrapper;
}

export function collectImageMatches(from: number, text: string): MarkdownImageMatch[] {
  const matches: MarkdownImageMatch[] = [];
  let match = INLINE_IMAGE_PATTERN.exec(text);
  while (match) {
    const source = parseMarkdownImageTarget(match[2] ?? '');
    if (source && (isRemoteImageSource(source) || isInternalImageSource(source))) {
      const start = from + match.index;
      matches.push({ from: start, to: start + match[0].length, alt: match[1] ?? '', source });
    }
    match = INLINE_IMAGE_PATTERN.exec(text);
  }
  INLINE_IMAGE_PATTERN.lastIndex = 0;
  return matches;
}
