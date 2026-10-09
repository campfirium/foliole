import type { PdfViewRect } from '../../features/pdf/model/pdfReadingView';

export interface PdfRangeGuides { x: number[]; y: number[] }
type Edges = { left: boolean; right: boolean; top: boolean; bottom: boolean };
function nearest(value: number, targets: number[], tolerance: number) {
  return targets.filter((target) => Math.abs(target - value) <= tolerance)
    .sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
}
function snapAxis(start: number, length: number, targets: number[], tolerance: number,
  first: boolean, last: boolean, move: boolean) {
  const a = first ? nearest(start, targets, tolerance) : undefined;
  const b = last ? nearest(start + length, targets, tolerance) : undefined;
  if (move) {
    const useFirst = a !== undefined && (b === undefined || Math.abs(a - start) <= Math.abs(b - start - length));
    const guide = useFirst ? a : b;
    return { start: guide === undefined ? start : useFirst ? guide : guide - length, length, guide };
  }
  const nextStart = a ?? start;
  const nextEnd = b ?? start + length;
  return nextEnd - nextStart >= 0.01
    ? { start: nextStart, length: nextEnd - nextStart, guide: a ?? b }
    : { start, length, guide: undefined };
}
export function snapPdfViewRange(rect: PdfViewRect, guides: PdfRangeGuides,
  size: { width: number; height: number }, kind: string) {
  const all = kind === 'move' || kind === 'draw';
  const edges: Edges = { left: all || kind.endsWith('w'), right: all || kind.endsWith('e'),
    top: all || kind.startsWith('n'), bottom: all || kind.startsWith('s') };
  const x = snapAxis(rect.x, rect.width, guides.x, 6 / size.width, edges.left, edges.right, kind === 'move');
  const y = snapAxis(rect.y, rect.height, guides.y, 6 / size.height, edges.top, edges.bottom, kind === 'move');
  return { rect: { x: x.start, y: y.start, width: x.length, height: y.length }, vertical: x.guide, horizontal: y.guide };
}
