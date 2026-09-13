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

export async function prepareReadwiseApiEpubCover(
  document: PreparedReadwiseApiDocument
): Promise<PreparedReadwiseApiEpubCover> {
  if (!document.coverImageUrl) return { attachmentIds: [], degradedReason: null, text: '' };
  const alt = `${document.title.replace(/[\]\r\n]/gu, ' ').trim()} cover`;
  const context = new ImageLocalizationContext({
    bypassFailureCache: true,
    deadlineAt: Date.now() + COVER_PREPARATION_BUDGET_MS,
    fetchAttempts: 2
  });
  const localized = await context.localizeMarkdown(`![${alt}](${document.coverImageUrl})`, {
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
