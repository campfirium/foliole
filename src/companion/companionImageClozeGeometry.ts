export interface ImageClozeView { scale: number; x: number; y: number }
export interface ImageClozeRect { x: number; y: number; width: number; height: number }
export const initialImageClozeView: ImageClozeView = { scale: 1, x: 0, y: 0 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function centeredImageClozeRect(image: DOMRect, viewport: DOMRect): ImageClozeRect {
  return {
    x: clamp((viewport.left + viewport.width / 2 - image.left) / image.width - 0.15, 0, 0.7),
    y: clamp((viewport.top + viewport.height / 2 - image.top) / image.height - 0.1, 0, 0.8),
    width: 0.3, height: 0.2
  };
}

export function zoomImageClozeView(view: ImageClozeView, scale: number, anchor = { x: 0, y: 0 }) {
  const next = clamp(scale, 1, 6);
  const ratio = next / view.scale;
  return { scale: next, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}

export function changeImageClozeRect(rect: ImageClozeRect, handle: string, dx: number, dy: number): ImageClozeRect {
  if (handle === 'move') return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.width), y: clamp(rect.y + dy, 0, 1 - rect.height) };
  const left = handle.includes('w') ? clamp(rect.x + dx, 0, rect.x + rect.width - 0.03) : rect.x;
  const top = handle.includes('n') ? clamp(rect.y + dy, 0, rect.y + rect.height - 0.03) : rect.y;
  const right = handle.includes('e') ? clamp(rect.x + rect.width + dx, left + 0.03, 1) : rect.x + rect.width;
  const bottom = handle.includes('s') ? clamp(rect.y + rect.height + dy, top + 0.03, 1) : rect.y + rect.height;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
