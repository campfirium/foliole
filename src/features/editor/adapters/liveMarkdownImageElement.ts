import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import { openInBrowserHint } from '../model/openInBrowserHint';

export type RequestEditorMeasure = (() => void) | null;

const LOCAL_ATTACHMENT_RETRY_DELAY_MS = 250;

function buildLocalAttachmentRetrySource(source: string) {
  const url = new URL(source);
  url.searchParams.set('retry', '1');
  return url.toString();
}

function assignImageSource(
  image: HTMLImageElement,
  source: string,
  deferSource: boolean,
  isActive: () => boolean
) {
  if (!deferSource) {
    if (isActive()) image.src = source;
    return;
  }
  if (source) queueMicrotask(() => {
    if (isActive()) image.src = source;
  });
}

export function applyMarkdownImageAttributes(
  image: HTMLImageElement,
  args: { alt: string; display: MarkdownImageMatch['display']; linkHref?: string }
) {
  const locale = getStoredAppLocale();
  image.alt = args.alt || translate(locale, 'desktop.editor.image.altFallback');
  image.className =
    args.display === 'inline'
      ? 'cm-md-image-element cm-md-image-element-inline'
      : 'cm-md-image-element cm-md-image-element-block';
  if (args.linkHref) {
    image.dataset.mdLinkUrl = args.linkHref;
    image.title = openInBrowserHint(locale);
  }
}

export function createMarkdownImageElement(args: {
  alt: string;
  display: MarkdownImageMatch['display'];
  deferSource?: boolean;
  onError?: (() => void) | null;
  onLoad?: (() => void) | null;
  linkHref?: string;
  requestMeasure?: RequestEditorMeasure;
  source: string;
  isActive?: () => boolean;
}) {
  const image = document.createElement('img');
  const isActive = args.isActive ?? (() => true);
  applyMarkdownImageAttributes(image, args);
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  if (args.source.startsWith('foliole-asset://')) {
    image.crossOrigin = 'anonymous';
  }
  if (args.onError || args.requestMeasure) {
    let didReportError = false;
    let didRetryLocalAttachment = false;
    image.addEventListener('error', () => {
      if (!isActive()) return;
      if (args.source.startsWith('foliole-asset://') && !didRetryLocalAttachment) {
        didRetryLocalAttachment = true;
        setTimeout(() => {
          if (isActive()) image.src = buildLocalAttachmentRetrySource(args.source);
        }, LOCAL_ATTACHMENT_RETRY_DELAY_MS);
        return;
      }
      if (didReportError) return;
      didReportError = true;
      args.onError?.();
      args.requestMeasure?.();
    });
  }
  if (args.onLoad || args.requestMeasure) {
    image.addEventListener('load', () => {
      if (!isActive()) return;
      args.onLoad?.();
      args.requestMeasure?.();
    }, { once: true });
  }
  assignImageSource(image, args.source, args.deferSource ?? false, isActive);
  return image;
}
