interface PdfOverlayLocator {
  id: string;
  rects?: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}

export function resolvePdfOverlayMarkerSize(zoom: number) {
  return Math.max(10, Math.round((zoom / 100) * 12));
}

export function renderPdfOverlayMarker(
  locator: PdfOverlayLocator,
  markerSize: number,
  className = 'pointer-events-none absolute z-surface -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--app-highlight-surface-color)] shadow-marker ring-1 ring-[var(--app-highlight-surface-color)]',
  testId = 'pdf-highlight-marker'
) {
  if (typeof locator.x !== 'number' || typeof locator.y !== 'number') {
    return null;
  }
  const markerTop = `${Math.max(0, Math.min(100, locator.y * 100))}%`;
  const markerLeft = `${Math.max(0, Math.min(100, locator.x * 100))}%`;
  return (
    <span
      aria-hidden="true"
      className={className}
      data-testid={testId}
      key={locator.id}
      style={{ height: markerSize, left: markerLeft, top: markerTop, width: markerSize }}
    />
  );
}

export function renderPdfOverlayRects(
  locator: PdfOverlayLocator,
  className = 'pointer-events-none absolute z-surface rounded-[2px] bg-[var(--app-highlight-surface-color)] ring-1 ring-[var(--app-highlight-surface-color)]',
  testId = 'pdf-highlight-rect'
) {
  const rects = Array.isArray(locator.rects) ? locator.rects : [];
  if (rects.length === 0) {
    return null;
  }
  return rects.map((rect, index) => (
    <span
      aria-hidden="true"
      className={className}
      data-testid={testId}
      key={`${locator.id}:${index}`}
      style={{
        height: `${Math.max(0, Math.min(100, rect.height * 100))}%`,
        left: `${Math.max(0, Math.min(100, rect.x * 100))}%`,
        top: `${Math.max(0, Math.min(100, rect.y * 100))}%`,
        width: `${Math.max(0, Math.min(100, rect.width * 100))}%`
      }}
    />
  ));
}
