import { disposeImageExcerptRegionInteractions } from './imageExcerptRegionInteractions';
import { disposeRemoteImageOnDemandLocalization } from './remoteImageOnDemandLocalization';

export function disposeMarkdownImageWidgetDom(wrapper: HTMLElement) {
  for (const surface of Array.from(wrapper.querySelectorAll<HTMLElement>('.cm-md-image-surface'))) {
    disposeImageExcerptRegionInteractions(surface);
    disposeRemoteImageOnDemandLocalization(surface);
  }
}
