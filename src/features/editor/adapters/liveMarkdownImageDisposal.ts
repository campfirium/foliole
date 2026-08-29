import { disposeImageExcerptRegionInteractions } from './imageExcerptRegionInteractions';

export function disposeMarkdownImageWidgetDom(wrapper: HTMLElement) {
  for (const surface of Array.from(wrapper.querySelectorAll<HTMLElement>('.cm-md-image-surface'))) {
    disposeImageExcerptRegionInteractions(surface);
  }
}
