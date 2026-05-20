import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences';
import { buildAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { importRemoteImageAttachment } from '../../../shared/platform/remoteImageLocalization';

import {
  isRemoteImageLinkTarget,
  removeLocalizedImageOnlyRemoteWrappingLinks,
  resolveImageWrappingLink
} from './markdownImageWrappingLinks';

interface MarkdownImageToken {
  alt: string;
  from: number;
  raw: string;
  sourceUrl: string;
  suffix: string;
  to: number;
  wrappingLinkTarget?: string;
}

interface LocalizedRemoteImageImport {
  attachment_id: string;
  intrinsic_size?: { height: number; width: number } | null;
  original_name: string;
  status: 'imported';
}

function isRemoteImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function collectRemoteMarkdownImages(markdown: string) {
  const matches: MarkdownImageToken[] = [];

  for (const reference of collectMarkdownImageReferences(markdown)) {
    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    if (parsedTarget && isRemoteImageUrl(parsedTarget.destination)) {
      const wrappingLink = resolveImageWrappingLink(markdown, reference);
      const imageWrappingLink = wrappingLink && isRemoteImageLinkTarget(wrappingLink.target) ? wrappingLink : null;
      const from = imageWrappingLink?.from ?? reference.start;
      const to = imageWrappingLink?.to ?? reference.end;
      matches.push({
        alt: imageWrappingLink?.caption || reference.altText,
        from,
        raw: markdown.slice(from, to),
        sourceUrl: parsedTarget.destination,
        suffix: parsedTarget.suffix,
        to,
        ...(imageWrappingLink ? { wrappingLinkTarget: imageWrappingLink.target } : {})
      });
    }
  }

  return matches;
}

function buildLocalizedMarkdownImage(token: MarkdownImageToken, attachmentId: string, originalName: string) {
  const suffix = token.suffix ? ` ${token.suffix}` : '';
  const imageMarkdown = `![${token.alt}](${buildAssetMarkdownUrl(attachmentId, originalName)}${suffix})`;
  return token.wrappingLinkTarget ? `[${imageMarkdown}](${token.wrappingLinkTarget})` : imageMarkdown;
}

const LARGE_IMAGE_MIN_WIDTH = 320;
const SMALL_IMAGE_MAX_SIDE = 128;

function isLargeImage(size: { height: number; width: number } | null | undefined) {
  return Boolean(size && size.width >= LARGE_IMAGE_MIN_WIDTH);
}

function isSmallImage(size: { height: number; width: number } | null | undefined) {
  return Boolean(size && size.width <= SMALL_IMAGE_MAX_SIDE && size.height <= SMALL_IMAGE_MAX_SIDE);
}

function findLineStart(text: string, index: number) {
  return text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
}

function findLineEnd(text: string, index: number) {
  const lineEnd = text.indexOf('\n', index);
  return lineEnd >= 0 ? lineEnd : text.length;
}

function consumeInlineWhitespace(text: string, index: number) {
  let cursor = index;
  while (text[cursor] === ' ' || text[cursor] === '\t') {
    cursor += 1;
  }
  return cursor;
}

function layoutLocalizedMarkdownImage(input: {
  imageMarkdown: string;
  markdown: string;
  previousLocalizedImageWasSmall: boolean;
  range: MarkdownImageToken;
  size: { height: number; width: number } | null | undefined;
  textBeforeImage: string;
}) {
  if (isSmallImage(input.size)) {
    const before =
      input.previousLocalizedImageWasSmall && input.textBeforeImage.trim().length === 0 ? ' ' : input.textBeforeImage;
    return { before, cursor: input.range.to, image: input.imageMarkdown, isSmall: true };
  }

  if (!isLargeImage(input.size)) {
    return { before: input.textBeforeImage, cursor: input.range.to, image: input.imageMarkdown, isSmall: false };
  }

  const lineStart = findLineStart(input.markdown, input.range.from);
  const lineEnd = findLineEnd(input.markdown, input.range.to);
  const hasTextBefore = input.markdown.slice(lineStart, input.range.from).trim().length > 0;
  const hasTextAfter = input.markdown.slice(input.range.to, lineEnd).trim().length > 0;
  if (!hasTextBefore && !hasTextAfter) {
    return { before: input.textBeforeImage, cursor: input.range.to, image: input.imageMarkdown, isSmall: false };
  }

  return {
    before: hasTextBefore ? `${input.textBeforeImage.replace(/[ \t]+$/u, '')}\n\n` : input.textBeforeImage,
    cursor: hasTextAfter ? consumeInlineWhitespace(input.markdown, input.range.to) : input.range.to,
    image: hasTextAfter ? `${input.imageMarkdown}\n\n` : input.imageMarkdown,
    isSmall: false
  };
}

export async function localizeRemoteMarkdownImages(nodeId: string, markdown: string) {
  const markdownWithoutStaleWrappingLinks = removeLocalizedImageOnlyRemoteWrappingLinks(markdown);
  const matches = collectRemoteMarkdownImages(markdownWithoutStaleWrappingLinks);
  if (matches.length === 0) {
    return markdownWithoutStaleWrappingLinks;
  }

  const resultByUrl = new Map<
    string,
    | {
        attachmentId: string;
        intrinsicSize?: { height: number; width: number } | null;
        originalName: string;
      }
    | null
  >();
  let localized = '';
  let cursor = 0;
  let previousLocalizedImageWasSmall = false;

  for (const match of matches) {
    if (!resultByUrl.has(match.sourceUrl)) {
      const result = await importRemoteImageAttachment(nodeId, match.sourceUrl);
      const imported = result?.status === 'imported' ? result as LocalizedRemoteImageImport : null;
      resultByUrl.set(
        match.sourceUrl,
        imported
          ? {
              attachmentId: imported.attachment_id,
              intrinsicSize: imported.intrinsic_size ?? null,
              originalName: imported.original_name
            }
          : null
      );
    }

    const localization = resultByUrl.get(match.sourceUrl);
    if (localization) {
      const layout = layoutLocalizedMarkdownImage({
        imageMarkdown: buildLocalizedMarkdownImage(match, localization.attachmentId, localization.originalName),
        markdown: markdownWithoutStaleWrappingLinks,
        previousLocalizedImageWasSmall,
        range: match,
        size: localization.intrinsicSize,
        textBeforeImage: markdownWithoutStaleWrappingLinks.slice(cursor, match.from)
      });
      localized += layout.before;
      localized += layout.image;
      cursor = layout.cursor;
      previousLocalizedImageWasSmall = layout.isSmall;
    } else {
      localized += markdownWithoutStaleWrappingLinks.slice(cursor, match.from);
      localized += match.raw;
      cursor = match.to;
      previousLocalizedImageWasSmall = false;
    }
  }

  localized += markdownWithoutStaleWrappingLinks.slice(cursor);
  return localized;
}
