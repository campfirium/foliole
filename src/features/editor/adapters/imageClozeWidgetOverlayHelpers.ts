import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

function toPercent(value: number) {
  return `${value * 100}%`;
}

function isWholeImageRegion(region: { height: number; width: number; x: number; y: number }) {
  return region.x <= 0.001 && region.y <= 0.001 && region.width >= 0.999 && region.height >= 0.999;
}

function setRegionElementBounds(element: HTMLElement, region: { height: number; width: number; x: number; y: number }) {
  element.style.left = toPercent(region.x);
  element.style.top = toPercent(region.y);
  element.style.width = toPercent(region.width);
  element.style.height = toPercent(region.height);
}

export function createImageRegionElement(
  region: { height: number; id: string; width: number; x: number; y: number },
  state: 'hidden' | 'normal' | 'outlined' | 'selected'
) {
  const regionElement = document.createElement('div');
  regionElement.className = 'cm-md-image-cloze-region';
  regionElement.dataset.regionId = region.id;
  regionElement.dataset.regionState = state;
  regionElement.dataset.regionScope = isWholeImageRegion(region) ? 'full-image' : 'partial';
  setRegionElementBounds(regionElement, region);
  return regionElement;
}

export function focusImageRegionInViewport(wrapper: HTMLElement, presentation: ImageClozeEditorPresentation | null) {
  const focusRegionId = presentation?.focusRegionId;
  if (!focusRegionId) {
    return;
  }
  const region = presentation?.regions.find((entry) => entry.id === focusRegionId) ?? null;
  if (!region) {
    return;
  }
  const scroller = wrapper.closest('.cm-scroller');
  if (!(scroller instanceof HTMLElement)) {
    return;
  }

  requestAnimationFrame(() => {
    const wrapperRect = wrapper.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const regionCenterY = (region.y + region.height * 0.5) * wrapperRect.height;
    const targetTop = scroller.scrollTop + (wrapperRect.top - scrollerRect.top) + regionCenterY - scroller.clientHeight * 0.35;
    scroller.scrollTop = Math.max(0, targetTop);
  });
}

export function createSavedRegionLayer(presentation: ImageClozeEditorPresentation | null) {
  const layer = document.createElement('div');
  layer.className = 'cm-md-image-cloze-regions';
  if (!presentation || presentation.regions.length === 0) {
    return layer;
  }

  const hiddenRegionIds = new Set(presentation.hiddenRegionIds);
  const outlinedRegionIds = new Set(presentation.outlinedRegionIds);
  for (const region of presentation.regions) {
    layer.append(
      createImageRegionElement(
        region,
        hiddenRegionIds.has(region.id) ? 'hidden' : outlinedRegionIds.has(region.id) ? 'outlined' : 'normal'
      )
    );
  }
  return layer;
}

export function syncSavedRegionLayerState(
  layer: HTMLElement,
  presentation: ImageClozeEditorPresentation | null,
  selectedRegionId: string | null
) {
  const hiddenRegionIds = new Set(presentation?.hiddenRegionIds ?? []);
  const outlinedRegionIds = new Set(presentation?.outlinedRegionIds ?? []);
  for (const regionElement of Array.from(layer.querySelectorAll('.cm-md-image-cloze-region'))) {
    const regionId = (regionElement as HTMLElement).dataset.regionId ?? '';
    (regionElement as HTMLElement).dataset.regionState =
      selectedRegionId === regionId
        ? 'selected'
        : hiddenRegionIds.has(regionId)
          ? 'hidden'
          : outlinedRegionIds.has(regionId)
            ? 'outlined'
            : 'normal';
  }
}
