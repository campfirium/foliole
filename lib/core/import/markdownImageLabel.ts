import { MARKDOWN_IMAGE_CROP_MARKER, MARKDOWN_IMAGE_FOCUS_MARKER, parseMarkdownImageRectLabel } from './markdownImageRectLabel.js';
import { collectMarkdownImageReferences } from './markdownImageReferences.js';

export const IMAGE_ONLY_MARKDOWN_LABEL = 'Image highlight';

export function projectMarkdownImageLabel(altText: string) {
  const label = parseMarkdownImageRectLabel(altText, MARKDOWN_IMAGE_CROP_MARKER).label;
  return parseMarkdownImageRectLabel(label, MARKDOWN_IMAGE_FOCUS_MARKER).label;
}

export function projectImageOnlyMarkdownLabel(value: string) {
  const references = collectMarkdownImageReferences(value);
  if (references.length === 0) {
    return '';
  }
  const remainder = references
    .reduceRight((text, reference) => text.slice(0, reference.start) + text.slice(reference.end), value)
    .trim();
  if (remainder.length > 0) {
    return '';
  }
  const altText = references
    .map((reference) => projectMarkdownImageLabel(reference.altText).trim())
    .filter(Boolean)
    .join(' ');
  return altText || IMAGE_ONLY_MARKDOWN_LABEL;
}
