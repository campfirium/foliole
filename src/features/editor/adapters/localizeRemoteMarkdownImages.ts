import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences';
import { buildAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { importRemoteImageAttachment } from '../../../shared/platform/remoteImageLocalization';

interface MarkdownImageToken {
  alt: string;
  from: number;
  raw: string;
  sourceUrl: string;
  suffix: string;
  to: number;
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
      matches.push({
        alt: reference.altText,
        from: reference.start,
        raw: reference.fullMatch,
        sourceUrl: parsedTarget.destination,
        suffix: parsedTarget.suffix,
        to: reference.end
      });
    }
  }

  return matches;
}

function buildLocalizedMarkdownImage(token: MarkdownImageToken, attachmentId: string, originalName: string) {
  const suffix = token.suffix ? ` ${token.suffix}` : '';
  return `![${token.alt}](${buildAssetMarkdownUrl(attachmentId, originalName)}${suffix})`;
}

const LARGE_IMAGE_MIN_WIDTH = 320;

function isLargeImage(size: { height: number; width: number } | null | undefined) {
  return Boolean(size && size.width >= LARGE_IMAGE_MIN_WIDTH);
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
  range: MarkdownImageToken;
  size: { height: number; width: number } | null | undefined;
  textBeforeImage: string;
}) {
  if (!isLargeImage(input.size)) {
    return { before: input.textBeforeImage, cursor: input.range.to, image: input.imageMarkdown };
  }

  const lineStart = findLineStart(input.markdown, input.range.from);
  const lineEnd = findLineEnd(input.markdown, input.range.to);
  const hasTextBefore = input.markdown.slice(lineStart, input.range.from).trim().length > 0;
  const hasTextAfter = input.markdown.slice(input.range.to, lineEnd).trim().length > 0;
  if (!hasTextBefore && !hasTextAfter) {
    return { before: input.textBeforeImage, cursor: input.range.to, image: input.imageMarkdown };
  }

  return {
    before: hasTextBefore ? `${input.textBeforeImage.replace(/[ \t]+$/u, '')}\n\n` : input.textBeforeImage,
    cursor: hasTextAfter ? consumeInlineWhitespace(input.markdown, input.range.to) : input.range.to,
    image: hasTextAfter ? `${input.imageMarkdown}\n\n` : input.imageMarkdown
  };
}

export async function localizeRemoteMarkdownImages(nodeId: string, markdown: string) {
  const matches = collectRemoteMarkdownImages(markdown);
  if (matches.length === 0) {
    return markdown;
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

  for (const match of matches) {
    if (!resultByUrl.has(match.sourceUrl)) {
      const result = await importRemoteImageAttachment(nodeId, match.sourceUrl);
      const imported = result?.status === 'imported' ? result as LocalizedRemoteImageImport : null;
      resultByUrl.set(
        match.sourceUrl,
        imported
          ? {
              attachmentId: imported.attachment_id,
              intrinsicSize: imported.intrinsic_size,
              originalName: imported.original_name
            }
          : null
      );
    }

    const localization = resultByUrl.get(match.sourceUrl);
    if (localization) {
      const layout = layoutLocalizedMarkdownImage({
        imageMarkdown: buildLocalizedMarkdownImage(match, localization.attachmentId, localization.originalName),
        markdown,
        range: match,
        size: localization.intrinsicSize,
        textBeforeImage: markdown.slice(cursor, match.from)
      });
      localized += layout.before;
      localized += layout.image;
      cursor = layout.cursor;
    } else {
      localized += markdown.slice(cursor, match.from);
      localized += match.raw;
      cursor = match.to;
    }
  }

  localized += markdown.slice(cursor);
  return localized;
}
