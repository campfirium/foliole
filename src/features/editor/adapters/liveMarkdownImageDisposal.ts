import { disposeImageExcerptRegionInteractions } from './imageExcerptRegionInteractions';
import { disposeRemoteImageOnDemandLocalization } from './remoteImageOnDemandLocalization';

const disposedWidgets = new WeakSet<HTMLElement>();
const widgetCleanup = new WeakMap<HTMLElement, () => void>();

export function registerMarkdownImageWidgetCleanup(wrapper: HTMLElement, cleanup: () => void) {
  widgetCleanup.get(wrapper)?.();
  widgetCleanup.set(wrapper, cleanup);
}

export function isMarkdownImageWidgetDomDisposed(wrapper: HTMLElement) {
  return disposedWidgets.has(wrapper);
}

export function disposeMarkdownImageWidgetDom(wrapper: HTMLElement) {
  disposedWidgets.add(wrapper);
  widgetCleanup.get(wrapper)?.();
  widgetCleanup.delete(wrapper);
  for (const surface of Array.from(wrapper.querySelectorAll<HTMLElement>('.cm-md-image-surface'))) {
    disposeImageExcerptRegionInteractions(surface);
    disposeRemoteImageOnDemandLocalization(surface);
  }
}
