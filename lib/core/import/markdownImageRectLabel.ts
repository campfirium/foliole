export interface MarkdownImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MARKDOWN_IMAGE_FOCUS_MARKER = ';focus=';
export const MARKDOWN_IMAGE_CROP_MARKER = ';crop=';
const PRECISION = 10_000;

export function parseMarkdownImageRectLabel(label: string, marker: string) {
  const offset = label.lastIndexOf(marker);
  if (offset < 0) return { label, rect: null };
  const parts = label.slice(offset + marker.length).split(',');
  if (parts.length !== 4 || parts.some(part => !part.length || [...part].some(c => c < '0' || c > '9'))) {
    return { label, rect: null };
  }
  const [left, top, right, bottom] = parts.map(Number) as [number, number, number, number];
  if (right > PRECISION || bottom > PRECISION || right <= left || bottom <= top) {
    return { label, rect: null };
  }
  return {
    label: label.slice(0, offset),
    rect: { x: left / PRECISION, y: top / PRECISION,
      width: (right - left) / PRECISION, height: (bottom - top) / PRECISION }
  };
}

export function formatMarkdownImageRectLabel(label: string, region: MarkdownImageRect | null, marker: string) {
  const current = parseMarkdownImageRectLabel(label, marker).label;
  if (!region) return current;
  const values = [region.x, region.y, region.x + region.width, region.y + region.height];
  const serialized = values.map(value => Math.round(value * PRECISION)).join(',');
  return parseMarkdownImageRectLabel(`${current}${marker}${serialized}`, marker).rect
    ? `${current}${marker}${serialized}`
    : label;
}
