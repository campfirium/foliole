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

export async function localizeRemoteMarkdownImages(nodeId: string, markdown: string) {
  const matches = collectRemoteMarkdownImages(markdown);
  if (matches.length === 0) {
    return markdown;
  }

  const resultByUrl = new Map<
    string,
    | {
        attachmentId: string;
        originalName: string;
      }
    | null
  >();
  let localized = '';
  let cursor = 0;

  for (const match of matches) {
    localized += markdown.slice(cursor, match.from);

    if (!resultByUrl.has(match.sourceUrl)) {
      const result = await importRemoteImageAttachment(nodeId, match.sourceUrl);
      resultByUrl.set(
        match.sourceUrl,
        result?.status === 'imported'
          ? {
              attachmentId: result.attachment_id,
              originalName: result.original_name
            }
          : null
      );
    }

    const localization = resultByUrl.get(match.sourceUrl);
    localized += localization
      ? buildLocalizedMarkdownImage(match, localization.attachmentId, localization.originalName)
      : match.raw;
    cursor = match.to;
  }

  localized += markdown.slice(cursor);
  return localized;
}
