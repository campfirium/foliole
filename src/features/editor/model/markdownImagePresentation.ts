import type { MarkdownImageMatch } from './markdownImageMatches';

export interface MarkdownImageRenderPlan {
  attachmentProtocolSrc: string | null;
  display: MarkdownImageMatch['display'];
  fallbackStatus: 'unavailable' | null;
  imageSrc: string | null;
  isRemote: boolean;
}

function isBrowserImageSource(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'data:' || parsed.protocol === 'file:' || parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildAttachmentProtocolUrl(attachmentId: string) {
  return `foliole-asset://attachment/${encodeURIComponent(attachmentId)}`;
}

export function buildMarkdownImageRenderPlan(imageMatch: MarkdownImageMatch): MarkdownImageRenderPlan {
  if (isBrowserImageSource(imageMatch.source)) {
    return {
      attachmentProtocolSrc: null,
      display: imageMatch.display,
      fallbackStatus: null,
      imageSrc: imageMatch.source,
      isRemote: true
    };
  }

  if (!imageMatch.attachmentId) {
    return {
      attachmentProtocolSrc: null,
      display: imageMatch.display,
      fallbackStatus: 'unavailable',
      imageSrc: null,
      isRemote: false
    };
  }

  return {
    attachmentProtocolSrc: buildAttachmentProtocolUrl(imageMatch.attachmentId),
    display: imageMatch.display,
    fallbackStatus: null,
    imageSrc: buildAttachmentProtocolUrl(imageMatch.attachmentId),
    isRemote: false
  };
}
