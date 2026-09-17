import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { parseAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';

import { ImageLocalizationContext } from './imageLocalizationContext.js';

const COVER_PREPARATION_BUDGET_MS = 30_000;

export interface PreparedReadwiseApiEpubCover {
  attachmentIds: string[];
  degradedReason: string | null;
  text: string;
}

function buildReadwiseApiEpubCoverMarkdown(document: PreparedReadwiseApiDocument) {
  if (!document.coverImageUrl) return '';
  const alt = `${document.title.replace(/[\]\r\n]/gu, ' ').trim()} cover`;
  return `![${alt}](${document.coverImageUrl})`;
}

export function prepareDeferredReadwiseApiEpubCover(
  document: PreparedReadwiseApiDocument
): PreparedReadwiseApiEpubCover {
  return { attachmentIds: [], degradedReason: null, text: buildReadwiseApiEpubCoverMarkdown(document) };
}

export async function prepareReadwiseApiEpubCover(
  document: PreparedReadwiseApiDocument
): Promise<PreparedReadwiseApiEpubCover> {
  const remoteMarkdown = buildReadwiseApiEpubCoverMarkdown(document);
  if (!remoteMarkdown) return { attachmentIds: [], degradedReason: null, text: '' };
  const context = new ImageLocalizationContext({
    bypassFailureCache: true,
    deadlineAt: Date.now() + COVER_PREPARATION_BUDGET_MS,
    fetchAttempts: 2
  });
  const localized = await context.localizeMarkdown(remoteMarkdown, {
    layoutLargeImages: false
  });
  const usable = collectMarkdownImageReferences(localized.text).some((reference) => {
    const target = parseMarkdownImageTarget(reference.rawTarget)?.destination ?? '';
    return Boolean(parseAssetMarkdownUrl(target));
  });
  return usable
    ? { attachmentIds: localized.attachmentIds, degradedReason: null, text: localized.text }
    : { attachmentIds: [], degradedReason: 'Reader EPUB cover unavailable.', text: '' };
}
