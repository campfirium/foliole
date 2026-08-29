import type { PdfNormalizedRect } from './pdfVisualExcerptGeometry';

const CONTROL_SELECTOR = 'a, button, input, select, textarea, [role="button"], [role="menu"], [role="toolbar"]';
const TEXT_SPAN_SELECTOR = '.textLayer span:not(.endOfContent)';

export type PdfVisualExcerptPointerKind = 'control' | 'text' | 'visual';
export type PdfVisualExcerptPointerAction = PdfVisualExcerptPointerKind | 'outline';

export function resolvePdfVisualExcerptPointerKind(target: EventTarget | null): PdfVisualExcerptPointerKind {
  if (!(target instanceof Element)) return 'visual';
  if (target.closest(CONTROL_SELECTOR)) return 'control';
  return target.closest(TEXT_SPAN_SELECTOR) ? 'text' : 'visual';
}

export function resolvePdfVisualExcerptPointerAction(
  target: EventTarget | null,
  nearOutlineEdge: boolean
): PdfVisualExcerptPointerAction {
  const kind = resolvePdfVisualExcerptPointerKind(target);
  if (kind === 'control') return 'control';
  return nearOutlineEdge ? 'outline' : kind;
}

export function findPdfExcerptNearEdge(
  point: { x: number; y: number },
  rects: Array<{ nodeId: string; rect: PdfNormalizedRect }>,
  tolerance: { x: number; y: number }
) {
  const candidates = rects.flatMap((candidate) => {
    const { rect } = candidate;
    const withinX = point.x >= rect.x - tolerance.x && point.x <= rect.x + rect.width + tolerance.x;
    const withinY = point.y >= rect.y - tolerance.y && point.y <= rect.y + rect.height + tolerance.y;
    if (!withinX || !withinY) return [];
    const horizontalDistance = Math.min(Math.abs(point.x - rect.x), Math.abs(point.x - rect.x - rect.width));
    const verticalDistance = Math.min(Math.abs(point.y - rect.y), Math.abs(point.y - rect.y - rect.height));
    if (horizontalDistance > tolerance.x && verticalDistance > tolerance.y) return [];
    const normalizedDistance = Math.min(
      horizontalDistance / Math.max(Number.EPSILON, tolerance.x),
      verticalDistance / Math.max(Number.EPSILON, tolerance.y)
    );
    return [{ candidate, normalizedDistance }];
  });
  candidates.sort((left, right) => left.normalizedDistance - right.normalizedDistance);
  return candidates[0]?.candidate ?? null;
}
