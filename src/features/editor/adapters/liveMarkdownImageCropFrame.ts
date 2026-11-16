import { toOriginalImageRect } from '../model/markdownImageCrop';
import type { ImageFocusRect } from '../model/markdownImageFocus';

const cropByOverlay = new WeakMap<HTMLElement, ImageFocusRect>();

export function createImageCropPlane(wrapper: HTMLElement, crop: ImageFocusRect) {
  const viewport = document.createElement('span');
  viewport.className = 'cm-md-image-crop-viewport';
  const plane = document.createElement('span');
  plane.className = 'cm-md-image-crop-plane';
  Object.assign(plane.style, {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-100 * crop.x / crop.width}%`,
    top: `${-100 * crop.y / crop.height}%`
  });
  viewport.append(plane);
  wrapper.append(viewport);
  wrapper.dataset.mdImageCropVisible = 'true';
  return plane;
}

export function setImageOverlayCrop(overlay: HTMLElement, crop: ImageFocusRect) {
  cropByOverlay.set(overlay, crop);
}

export function originalImageDraft(overlay: HTMLElement, rect: ImageFocusRect) {
  return toOriginalImageRect(rect, cropByOverlay.get(overlay));
}

export function originalImagePoint(overlay: HTMLElement, point: { x: number; y: number; width: number; height: number } | null) {
  if (!point) return null;
  const crop = cropByOverlay.get(overlay);
  if (!crop) return point;
  return {
    x: crop.x + point.x * crop.width,
    y: crop.y + point.y * crop.height,
    width: point.width / crop.width,
    height: point.height / crop.height
  };
}
