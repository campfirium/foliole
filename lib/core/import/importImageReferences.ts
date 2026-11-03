import { buildAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { normalizeSafeMarkdownDataImageUrl, parseMarkdownDataImageSize } from '../../platform/markdownImageDataUrl.js';

import { rewriteInlineImageReferences, type InlineImageReference } from './inlineImageReferences.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from './markdownImageReferences.js';

type ImportedImageResult = { status: 'skipped' } | { status: 'error'; message: string }
  | { status: 'imported'; storageKey: string };

const SMALL_IMAGE_MAX_SIDE = 128;

function isSmallDataImageDestination(destination: string) {
  const size = parseMarkdownDataImageSize(destination);
  return Boolean(size && size.width <= SMALL_IMAGE_MAX_SIDE && size.height <= SMALL_IMAGE_MAX_SIDE);
}

function compactConsecutiveSmallDataImages(content: string) {
  let compacted = '';
  let cursor = 0;
  let previousWasSmallDataImage = false;

  for (const reference of collectMarkdownImageReferences(content)) {
    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    const isSmallDataImage = Boolean(parsedTarget && isSmallDataImageDestination(parsedTarget.destination));
    const gap = content.slice(cursor, reference.start);
    compacted += previousWasSmallDataImage && isSmallDataImage && gap.trim().length === 0 ? ' ' : gap;
    compacted += reference.fullMatch;
    cursor = reference.end;
    previousWasSmallDataImage = isSmallDataImage;
  }

  return `${compacted}${content.slice(cursor)}`;
}

export function rewriteImportedImageReferences(content: string,
  importImage: (reference: InlineImageReference) => ImportedImageResult) {
  const degradedMessages: string[] = [];
  const rewritten = rewriteInlineImageReferences(content, (reference) => {
    const normalizedDataImageUrl = normalizeSafeMarkdownDataImageUrl(reference.destination);
    if (normalizedDataImageUrl) {
      const suffix = reference.suffix ? ` ${reference.suffix}` : '';
      return `![${reference.altText}](${normalizedDataImageUrl}${suffix})`;
    }

    const importResult = importImage(reference);
    if (importResult.status === 'skipped') {
      return reference.fullMatch;
    }
    if (importResult.status === 'error') {
      degradedMessages.push(importResult.message);
      return reference.fullMatch;
    }

    const suffix = reference.suffix ? ` ${reference.suffix}` : '';
    return `![${reference.altText}](${buildAssetMarkdownUrl(importResult.storageKey)}${suffix})`;
  });
  return { content: compactConsecutiveSmallDataImages(rewritten), degradedMessages };
}
