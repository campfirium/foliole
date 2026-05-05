import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences';
import { ASSET_MARKDOWN_SCHEME, parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';

export interface MarkdownImageMatch {
  attachmentId: string | null;
  alt: string;
  display: 'block' | 'inline';
  from: number;
  source: string;
  to: number;
}

function isRemoteImageSource(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isInternalImageSource(value: string) {
  return value.startsWith(ASSET_MARKDOWN_SCHEME);
}

function resolveImageDisplay(text: string, matchIndex: number, raw: string) {
  const before = text.slice(0, matchIndex).trim();
  const after = text.slice(matchIndex + raw.length).trim();
  return before.length === 0 && after.length === 0 ? 'block' : 'inline';
}

export function collectImageMatches(from: number, text: string): MarkdownImageMatch[] {
  const matches: MarkdownImageMatch[] = [];

  for (const match of collectMarkdownImageReferences(text)) {
    const target = parseMarkdownImageTarget(match.rawTarget);
    const source = target?.destination ?? null;
    if (source && (isRemoteImageSource(source) || isInternalImageSource(source))) {
      const start = from + match.start;
      matches.push({
        attachmentId: isInternalImageSource(source) ? parseAssetMarkdownUrl(source) : null,
        alt: match.altText,
        display: resolveImageDisplay(text, match.start, match.fullMatch),
        from: start,
        source,
        to: start + match.fullMatch.length
      });
    }
  }

  return matches;
}
