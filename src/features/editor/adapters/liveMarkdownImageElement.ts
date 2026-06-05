import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

export type RequestEditorMeasure = (() => void) | null;

export function createMarkdownImageElement(args: {
  alt: string;
  display: MarkdownImageMatch['display'];
  deferSource?: boolean;
  onError?: (() => void) | null;
  onLoad?: (() => void) | null;
  linkHref?: string;
  requestMeasure?: RequestEditorMeasure;
  source: string;
}) {
  const image = document.createElement('img');
  const locale = getStoredAppLocale();
  image.alt = args.alt || translate(locale, 'desktop.editor.image.altFallback');
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.className =
    args.display === 'inline'
      ? 'cm-md-image-element cm-md-image-element-inline'
      : 'cm-md-image-element cm-md-image-element-block';
  if (args.onError || args.requestMeasure) {
    image.addEventListener('error', () => {
      args.onError?.();
      args.requestMeasure?.();
    }, { once: true });
  }
  if (args.onLoad || args.requestMeasure) {
    image.addEventListener('load', () => {
      args.onLoad?.();
      args.requestMeasure?.();
    }, { once: true });
  }
  if (args.linkHref) {
    image.dataset.mdLinkUrl = args.linkHref;
    image.title = translate(locale, 'desktop.editor.openInBrowserHint');
  }
  if (args.deferSource) {
    queueMicrotask(() => {
      image.src = args.source;
    });
  } else {
    image.src = args.source;
  }
  return image;
}
