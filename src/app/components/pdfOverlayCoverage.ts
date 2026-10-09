import type { renderPdfOverlayRects } from './pdfOverlayRender';
import type { PdfPageDimensions } from './pdfPageDimensions';

type OverlayRect = NonNullable<Parameters<typeof renderPdfOverlayRects>[0]['rects']>[number];

function sharesLine(left: OverlayRect, right: OverlayRect) {
  const overlap = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  const centerDistance = Math.abs(left.y + left.height / 2 - right.y - right.height / 2);
  return overlap >= Math.min(left.height, right.height) / 2 &&
    centerDistance <= Math.max(left.height, right.height) * 0.3;
}

function unite(left: OverlayRect, right: OverlayRect): OverlayRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  return { x, y, width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y };
}

function connectLine(rects: OverlayRect[], pageDimensions: PdfPageDimensions) {
  const coverage: OverlayRect[] = [];
  for (const rect of [...rects].sort((left, right) => left.x - right.x)) {
    const previous = coverage.at(-1);
    const gap = previous ? rect.x - previous.x - previous.width : Infinity;
    // Half a line height connects word spacing without spanning a column gutter.
    const spacing = Math.max(previous?.height ?? 0, rect.height) * pageDimensions.height / pageDimensions.width / 2;
    if (previous && gap <= spacing) {
      coverage[coverage.length - 1] = unite(previous, rect);
    } else {
      coverage.push({ ...rect });
    }
  }
  return coverage;
}

export function resolvePdfOverlayCoverage(rects: OverlayRect[], pageDimensions: PdfPageDimensions, rotation = 0): OverlayRect[] {
  if (Math.abs(rotation % 180) === 90) {
    const swap = (rect: OverlayRect): OverlayRect => ({ x: rect.y, y: rect.x, width: rect.height, height: rect.width });
    return resolvePdfOverlayCoverage(rects.map(swap), { width: pageDimensions.height, height: pageDimensions.width }).map(swap);
  }
  const lines: Array<{ reference: OverlayRect; rects: OverlayRect[] }> = [];
  for (const rect of [...rects].sort((left, right) => right.height - left.height || left.y - right.y)) {
    const line = lines.find(candidate => sharesLine(candidate.reference, rect));
    if (line) line.rects.push(rect);
    else lines.push({ reference: rect, rects: [rect] });
  }
  return lines.flatMap(line => connectLine(line.rects, pageDimensions));
}
