import {
  formatMarkdownImageRectLabel, MARKDOWN_IMAGE_FOCUS_MARKER, parseMarkdownImageRectLabel, type MarkdownImageRect
} from '../../../../lib/core/import/markdownImageRectLabel';

export type ImageFocusRect = MarkdownImageRect;

export const DEFAULT_IMAGE_FOCUS_TRANSPARENCY_PERCENT = 70;

export function parseMarkdownImageFocusLabel(label: string) {
  const { label: base, rect } = parseMarkdownImageRectLabel(label, MARKDOWN_IMAGE_FOCUS_MARKER);
  return { label: base, focus: rect };
}

export function formatMarkdownImageFocusLabel(label: string, focus: ImageFocusRect | null) {
  return formatMarkdownImageRectLabel(label, focus, MARKDOWN_IMAGE_FOCUS_MARKER);
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
    backgroundColor: `rgb(0 0 0 / var(--app-image-focus-opacity, ${(100 - DEFAULT_IMAGE_FOCUS_TRANSPARENCY_PERCENT) / 100}))`,
    clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left} ${top}, ${right} ${top}, ${right} ${bottom}, ${left} ${bottom}, ${left} ${top})`
  };
}
