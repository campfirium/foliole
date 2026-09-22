import { disposeImageExcerptRegionInteractions } from './imageExcerptRegionInteractions';
import { disposeRemoteImageOnDemandLocalization } from './remoteImageOnDemandLocalization';

const disposedWidgets = new WeakSet<HTMLElement>();

export function isMarkdownImageWidgetDomDisposed(wrapper: HTMLElement) {
  return disposedWidgets.has(wrapper);
}

export function disposeMarkdownImageWidgetDom(wrapper: HTMLElement) {
  disposedWidgets.add(wrapper);
  for (const surface of Array.from(wrapper.querySelectorAll<HTMLElement>('.cm-md-image-surface'))) {
    disposeImageExcerptRegionInteractions(surface);
    disposeRemoteImageOnDemandLocalization(surface);
  }
}
