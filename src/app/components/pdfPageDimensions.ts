export interface PdfPageDimensions {
  height: number;
  width: number;
}

export function resolvePdfPageDimensions(page: unknown): PdfPageDimensions | null {
  if (!page || typeof page !== 'object') {
    return null;
  }
  const candidate = page as {
    getViewport?: (input: { scale: number }) => { height?: number; width?: number };
    originalHeight?: number;
    originalWidth?: number;
    view?: [number, number, number, number];
  };
  if (typeof candidate.getViewport === 'function') {
    const viewport = candidate.getViewport({ scale: 1 });
    if (
      typeof viewport.width === 'number' &&
      Number.isFinite(viewport.width) &&
      viewport.width > 0 &&
      typeof viewport.height === 'number' &&
      Number.isFinite(viewport.height) &&
      viewport.height > 0
    ) {
      return { height: viewport.height, width: viewport.width };
    }
    return null;
  }
  if (
    typeof candidate.originalWidth === 'number' &&
    Number.isFinite(candidate.originalWidth) &&
    candidate.originalWidth > 0 &&
    typeof candidate.originalHeight === 'number' &&
    Number.isFinite(candidate.originalHeight) &&
    candidate.originalHeight > 0
  ) {
    return { height: candidate.originalHeight, width: candidate.originalWidth };
  }
  if (Array.isArray(candidate.view) && candidate.view.length >= 4) {
    const width = Math.abs(candidate.view[2] - candidate.view[0]);
    const height = Math.abs(candidate.view[3] - candidate.view[1]);
    return width > 0 && height > 0 ? { height, width } : null;
  }
  return null;
}

export function resolveRenderedPageDimensions(
  pageDimensions: PdfPageDimensions | null | undefined,
  fitWidthTargetWidth: number | null,
  rotation: number,
  zoomMode: 'custom' | 'fit-width',
  zoom: number
) {
  const fallback = { height: 1131, width: 800 };
  const baseDimensions = pageDimensions ?? fallback;
  const rotationQuarterTurns = ((rotation % 360) + 360) % 360;
  const rotatedDimensions =
    rotationQuarterTurns === 90 || rotationQuarterTurns === 270
      ? { height: baseDimensions.width, width: baseDimensions.height }
      : baseDimensions;
  if (zoomMode === 'fit-width') {
    const width = fitWidthTargetWidth ?? rotatedDimensions.width;
    return {
      height: Math.max(1, Math.round((width / rotatedDimensions.width) * rotatedDimensions.height)),
      width
    };
  }
  const scale = Math.max(0.01, zoom / 100);
  return {
    height: Math.max(1, Math.round(rotatedDimensions.height * scale)),
    width: Math.max(1, Math.round(rotatedDimensions.width * scale))
  };
}
