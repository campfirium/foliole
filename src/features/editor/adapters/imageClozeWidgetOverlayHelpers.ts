import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

function toPercent(value: number) {
  return `${value * 100}%`;
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
    const regionElement = document.createElement('div');
    regionElement.className = 'cm-md-image-cloze-region';
    regionElement.dataset.regionId = region.id;
    regionElement.dataset.regionState = hiddenRegionIds.has(region.id)
      ? 'hidden'
      : outlinedRegionIds.has(region.id)
        ? 'outlined'
        : 'normal';
    regionElement.style.left = toPercent(region.x);
    regionElement.style.top = toPercent(region.y);
    regionElement.style.width = toPercent(region.width);
    regionElement.style.height = toPercent(region.height);
    layer.append(regionElement);
  }
  return layer;
}
