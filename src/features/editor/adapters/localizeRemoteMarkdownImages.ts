import { buildAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { importRemoteImageAttachment } from '../../../shared/platform/remoteImageLocalization';

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\n]+)\)/g;

interface MarkdownImageToken {
  alt: string;
  from: number;
  raw: string;
  sourceUrl: string;
  suffix: string;
  to: number;
}

function parseRemoteTarget(rawTarget: string) {
  const trimmedTarget = rawTarget.trim();
  if (!trimmedTarget) {
    return null;
  }

  if (trimmedTarget.startsWith('<')) {
    const closingIndex = trimmedTarget.indexOf('>');
    if (closingIndex > 1) {
      const sourceUrl = trimmedTarget.slice(1, closingIndex);
      return { sourceUrl, suffix: trimmedTarget.slice(closingIndex + 1) };
    }
    return null;
  }

  const match = /^(\S+)([\s\S]*)$/.exec(trimmedTarget);
  if (!match?.[1]) {
    return null;
  }
  return {
    sourceUrl: match[1],
    suffix: match[2] ?? ''
  };
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
  let match = MARKDOWN_IMAGE_PATTERN.exec(markdown);
  while (match) {
    const parsedTarget = parseRemoteTarget(match[2] ?? '');
    if (parsedTarget && isRemoteImageUrl(parsedTarget.sourceUrl)) {
      const from = match.index;
      const raw = match[0] ?? '';
      matches.push({
        alt: match[1] ?? '',
        from,
        raw,
        sourceUrl: parsedTarget.sourceUrl,
        suffix: parsedTarget.suffix,
        to: from + raw.length
      });
    }
    match = MARKDOWN_IMAGE_PATTERN.exec(markdown);
  }
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
  return matches;
}

function buildLocalizedMarkdownImage(token: MarkdownImageToken, attachmentId: string, originalName: string) {
  return `![${token.alt}](${buildAssetMarkdownUrl(attachmentId, originalName)}${token.suffix})`;
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
