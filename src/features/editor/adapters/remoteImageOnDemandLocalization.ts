import {
  cancelImageExcerptRegionSelection,
  IMAGE_EXCERPT_SELECTION_MODE_EVENT,
  registerImageExcerptSelectionSurface,
  requestImageExcerptRegionSelection
} from '../model/imageExcerptRegionSelection';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import { requestRemoteImageLocalization } from './remoteImageLocalizationEvents';

const cleanupBySurface = new WeakMap<HTMLElement, () => void>();

export function attachRemoteImageOnDemandLocalization(
  surface: HTMLElement,
  nodeId: string,
  imageMatch: MarkdownImageMatch
) {
  let active = false;
  let pending = false;
  const unregister = registerImageExcerptSelectionSurface(nodeId);
  const onMode = (event: Event) => {
    active = (event as CustomEvent<string | null>).detail === nodeId;
  };
  const localize = () => {
    if (!active || pending) return;
    pending = true;
    const widget = surface.closest<HTMLElement>('.cm-md-image-widget');
    const from = Number(widget?.dataset.mdImageFrom);
    const to = Number(widget?.dataset.mdImageTo);
    void requestRemoteImageLocalization(surface, {
      from: Number.isInteger(from) ? from : imageMatch.from,
      nodeId,
      source: imageMatch.source,
      to: Number.isInteger(to) ? to : imageMatch.to
    }).then((localized) => {
      if (!localized) cancelImageExcerptRegionSelection();
      if (localized) queueMicrotask(() => requestImageExcerptRegionSelection(nodeId));
    }).finally(() => { pending = false; });
  };
  window.addEventListener(IMAGE_EXCERPT_SELECTION_MODE_EVENT, onMode);
  surface.addEventListener('mousemove', localize);
  surface.addEventListener('pointerdown', localize);
  cleanupBySurface.set(surface, () => {
    unregister();
    window.removeEventListener(IMAGE_EXCERPT_SELECTION_MODE_EVENT, onMode);
    surface.removeEventListener('mousemove', localize);
    surface.removeEventListener('pointerdown', localize);
  });
}

export function disposeRemoteImageOnDemandLocalization(surface: HTMLElement) {
  cleanupBySurface.get(surface)?.();
  cleanupBySurface.delete(surface);
}
