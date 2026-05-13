import type { MarkdownImageMatch } from './markdownImageMatches';

export interface MarkdownImageRenderPlan {
  attachmentProtocolSrc: string | null;
  browserImageSrc: string | null;
  display: MarkdownImageMatch['display'];
  fallbackStatus: 'unavailable' | null;
  imageSrc: string | null;
  isRemote: boolean;
}

function isRemoteHttpImageSource(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isInlineBrowserImageSource(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'data:' || parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

function buildAttachmentProtocolUrl(attachmentId: string) {
  return `foliole-asset://attachment/${encodeURIComponent(attachmentId)}`;
}

export function buildMarkdownImageRenderPlan(imageMatch: MarkdownImageMatch): MarkdownImageRenderPlan {
  if (isRemoteHttpImageSource(imageMatch.source)) {
    return {
      attachmentProtocolSrc: null,
      browserImageSrc: null,
      display: imageMatch.display,
      fallbackStatus: null,
      imageSrc: imageMatch.source,
      isRemote: true
    };
  }

  if (isInlineBrowserImageSource(imageMatch.source)) {
    return {
      attachmentProtocolSrc: null,
      browserImageSrc: imageMatch.source,
      display: imageMatch.display,
      fallbackStatus: null,
      imageSrc: imageMatch.source,
      isRemote: false
    };
  }

  if (!imageMatch.attachmentId) {
    return {
      attachmentProtocolSrc: null,
      browserImageSrc: null,
      display: imageMatch.display,
      fallbackStatus: 'unavailable',
      imageSrc: null,
      isRemote: false
    };
  }

  return {
    attachmentProtocolSrc: buildAttachmentProtocolUrl(imageMatch.attachmentId),
    browserImageSrc: null,
    display: imageMatch.display,
    fallbackStatus: null,
    imageSrc: buildAttachmentProtocolUrl(imageMatch.attachmentId),
    isRemote: false
  };
}
