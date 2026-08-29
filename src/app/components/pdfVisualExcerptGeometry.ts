export interface PdfNormalizedRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

export function clampPdfNormalizedRect(rect: PdfNormalizedRect): PdfNormalizedRect {
  const x = Math.max(0, Math.min(1, rect.x));
  const y = Math.max(0, Math.min(1, rect.y));
  return {
    x,
    y,
    width: Math.max(0, Math.min(1 - x, rect.width)),
    height: Math.max(0, Math.min(1 - y, rect.height))
  };
}

export function rotatePdfNormalizedRect(rect: PdfNormalizedRect, rotation: number): PdfNormalizedRect {
  const value = clampPdfNormalizedRect(rect);
  if (normalizeRotation(rotation) === 90) {
    return { x: 1 - value.y - value.height, y: value.x, width: value.height, height: value.width };
  }
  if (normalizeRotation(rotation) === 180) {
    return { x: 1 - value.x - value.width, y: 1 - value.y - value.height, width: value.width, height: value.height };
  }
  if (normalizeRotation(rotation) === 270) {
    return { x: value.y, y: 1 - value.x - value.width, width: value.height, height: value.width };
  }
  return value;
}

export function unrotatePdfNormalizedRect(rect: PdfNormalizedRect, rotation: number) {
  return rotatePdfNormalizedRect(rect, 360 - normalizeRotation(rotation));
}

export function rectFromPointerDrag(startX: number, startY: number, endX: number, endY: number) {
  return clampPdfNormalizedRect({
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  });
}
