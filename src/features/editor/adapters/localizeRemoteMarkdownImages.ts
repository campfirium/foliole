import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences';
import { buildAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { importRemoteImageAttachment } from '../../../shared/platform/remoteImageLocalization';

interface MarkdownImageToken {
  from: number;
  raw: string;
  rawTarget: string;
  sourceUrl: string;
  to: number;
}

interface LocalizedRemoteImageImport {
  attachment_id: string;
  hash: string;
  mime_type: string;
  intrinsic_size?: { height: number; width: number } | null;
  original_name: string;
  status: 'imported';
  storage_key: string;
}

function toLocalizedRemoteImage(result: Awaited<ReturnType<typeof importRemoteImageAttachment>>) {
  const imported = result?.status === 'imported' ? result as LocalizedRemoteImageImport : null;
  return imported
    ? {
        attachmentId: imported.attachment_id,
        intrinsicSize: imported.intrinsic_size ?? null,
        originalName: imported.original_name,
        storageKey: imported.storage_key
      }
    : null;
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
        from: reference.start,
        raw: reference.fullMatch,
        rawTarget: reference.rawTarget,
        sourceUrl: parsedTarget.destination,
        to: reference.end
      });
    }
  }

  return matches;
}

function buildLocalizedMarkdownImage(token: MarkdownImageToken, storageKey: string) {
  const target = token.rawTarget.replace(token.sourceUrl, buildAssetMarkdownUrl(storageKey));
  return token.raw.replace(token.rawTarget, target);
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
        storageKey: string;
      }
    | null
  >();
  let localized = '';
  let cursor = 0;

  for (const match of matches) {
    if (!resultByUrl.has(match.sourceUrl)) {
      const result = await importRemoteImageAttachment(nodeId, match.sourceUrl);
      resultByUrl.set(match.sourceUrl, toLocalizedRemoteImage(result));
    }

    const localization = resultByUrl.get(match.sourceUrl);
    if (localization) {
      localized += markdown.slice(cursor, match.from);
      localized += buildLocalizedMarkdownImage(match, localization.storageKey);
      cursor = match.to;
    } else {
      localized += markdown.slice(cursor, match.from);
      localized += match.raw;
      cursor = match.to;
    }
  }

  localized += markdown.slice(cursor);
  return localized;
}
