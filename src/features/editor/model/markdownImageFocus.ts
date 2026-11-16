export interface ImageFocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FOCUS_MARKER = ';focus=';
const PRECISION = 10_000;
export const IMAGE_FOCUS_OPACITY = 0.3;

export function parseMarkdownImageFocusLabel(label: string) {
  const offset = label.lastIndexOf(FOCUS_MARKER);
  if (offset < 0) return { label, focus: null };
  const parts = label.slice(offset + FOCUS_MARKER.length).split(',');
  if (parts.length !== 4 || parts.some(part => !part.length || [...part].some(c => c < '0' || c > '9'))) {
    return { label, focus: null };
  }
  const [left, top, right, bottom] = parts.map(Number) as [number, number, number, number];
  if (right > PRECISION || bottom > PRECISION || right <= left || bottom <= top) {
    return { label, focus: null };
  }
  return {
    label: label.slice(0, offset),
    focus: { x: left / PRECISION, y: top / PRECISION,
      width: (right - left) / PRECISION, height: (bottom - top) / PRECISION }
  };
}

export function formatMarkdownImageFocusLabel(label: string, focus: ImageFocusRect | null) {
  const current = parseMarkdownImageFocusLabel(label).label;
  if (!focus) return current;
  const values = [focus.x, focus.y, focus.x + focus.width, focus.y + focus.height];
  const serialized = values.map(value => Math.round(value * PRECISION)).join(',');
  return parseMarkdownImageFocusLabel(`${current}${FOCUS_MARKER}${serialized}`).focus
    ? `${current}${FOCUS_MARKER}${serialized}`
    : label;
}

export function imageFocusMaskStyle(rect: ImageFocusRect) {
  const { x, y, width, height } = rect;
  const left = `${x * 100}%`;
  const top = `${y * 100}%`;
  const right = `${(x + width) * 100}%`;
  const bottom = `${(y + height) * 100}%`;
  return {
    position: 'absolute' as const,
    inset: '0',
    pointerEvents: 'none' as const,
    backgroundColor: `rgb(0 0 0 / ${IMAGE_FOCUS_OPACITY})`,
    clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left} ${top}, ${right} ${top}, ${right} ${bottom}, ${left} ${bottom}, ${left} ${top})`
  };
}
