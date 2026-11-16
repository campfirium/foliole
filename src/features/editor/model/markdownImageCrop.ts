import { formatMarkdownImageRectLabel, MARKDOWN_IMAGE_CROP_MARKER, parseMarkdownImageRectLabel } from '../../../../lib/core/import/markdownImageRectLabel';

import type { ImageFocusRect } from './markdownImageFocus';

export function parseMarkdownImageCropLabel(label: string) {
  return parseMarkdownImageRectLabel(label, MARKDOWN_IMAGE_CROP_MARKER);
}

export function formatMarkdownImageCropLabel(label: string, crop: ImageFocusRect | null) {
  return formatMarkdownImageRectLabel(label, crop, MARKDOWN_IMAGE_CROP_MARKER);
}

export function toOriginalImageRect(rect: ImageFocusRect, crop?: ImageFocusRect): ImageFocusRect {
  if (!crop) return rect;
  return {
    x: crop.x + rect.x * crop.width,
    y: crop.y + rect.y * crop.height,
    width: rect.width * crop.width,
    height: rect.height * crop.height
  };
}
