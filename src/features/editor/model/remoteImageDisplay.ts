import type { MarkdownImageMatch } from './markdownImageTypes';

export interface ImageIntrinsicSize {
  height: number;
  width: number;
}

const LARGE_IMAGE_MIN_WIDTH = 320;
const SMALL_IMAGE_MAX_SIDE = 128;

export function resolveImageDisplay(
  provisionalDisplay: MarkdownImageMatch['display'],
  size: ImageIntrinsicSize | null,
  displayWidth?: number
): MarkdownImageMatch['display'] {
  if (displayWidth || !size || size.width <= 0 || size.height <= 0) return provisionalDisplay;
  if (size.width <= SMALL_IMAGE_MAX_SIDE && size.height <= SMALL_IMAGE_MAX_SIDE) return 'inline';
  if (size.width >= LARGE_IMAGE_MIN_WIDTH) return 'block';
  return provisionalDisplay;
}
