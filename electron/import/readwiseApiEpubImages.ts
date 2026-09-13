import {
  collectMarkdownImageReferences,
  parseMarkdownImageTarget
} from '../../lib/core/import/markdownImageReferences.js';
import type { PreparedReadwiseApiEpubSection } from '../../lib/core/readwise/readwiseApiEpubStructure.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { parseAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';

import { ImageLocalizationContext } from './imageLocalizationContext.js';

const IMAGE_PREPARATION_BUDGET_MS = 120_000;
const UNAVAILABLE_IMAGE_PLACEHOLDER = '**Image unavailable.**';

export interface PreparedReadwiseApiEpubImageSection extends PreparedReadwiseApiEpubSection {
  attachmentIds: string[];
}

export interface PreparedReadwiseApiEpubImages {
  accounting: {
    conversionDroppedCount: number;
    localizedBodyCount: number;
    sourceBodyCount: number;
    treeBodyCount: number;
    unavailableBodyCount: number;
  };
  degradedReason: string | null;
  rootAttachmentIds: string[];
  rootBody: string;
  sections: PreparedReadwiseApiEpubImageSection[];
}

interface FinalizedMarkdown {
  attachmentIds: string[];
  localizedCount: number;
  text: string;
  unavailableCount: number;
}

export async function prepareReadwiseApiEpubImages(
  document: PreparedReadwiseApiDocument
): Promise<PreparedReadwiseApiEpubImages | null> {
  const structure = document.epubStructure;
  if (document.category !== 'epub' || !structure?.sections.length) return null;
  const context = new ImageLocalizationContext({
    bypassFailureCache: true,
    deadlineAt: Date.now() + IMAGE_PREPARATION_BUDGET_MS,
    fetchAttempts: 2
  });
  const root = await localizeAndFinalize(structure.rootBody, context);
  const sections: PreparedReadwiseApiEpubImageSection[] = [];
  for (const section of structure.sections) {
    const localized = await localizeAndFinalize(section.content, context);
    sections.push({ ...section, attachmentIds: localized.attachmentIds, content: localized.text });
  }
  const sourceBodyCount = structure.imageCount;
  const treeBodyCount = countImageReferences(structure.rootBody)
    + structure.sections.reduce((sum, section) => sum + countImageReferences(section.content), 0);
  const localizedBodyCount = countAssetReferences(root.text)
    + sections.reduce((sum, section) => sum + countAssetReferences(section.content), 0);
  const unavailableBodyCount = countUnavailablePlaceholders(root.text)
    + sections.reduce((sum, section) => sum + countUnavailablePlaceholders(section.content), 0);
  const conversionDroppedCount = Math.max(0, sourceBodyCount - treeBodyCount);
  return {
    accounting: { conversionDroppedCount, localizedBodyCount, sourceBodyCount, treeBodyCount, unavailableBodyCount },
    degradedReason: imageDegradedReason({
      conversionDroppedCount,
      sourceBodyCount,
      unavailableBodyCount
    }),
    rootAttachmentIds: root.attachmentIds,
    rootBody: root.text,
    sections
  };
}

async function localizeAndFinalize(markdown: string, context: ImageLocalizationContext): Promise<FinalizedMarkdown> {
  const localized = await context.localizeMarkdown(markdown, { layoutLargeImages: false });
  let text = localized.text;
  let unavailableCount = 0;
  for (const reference of collectMarkdownImageReferences(localized.text).reverse()) {
    const target = parseMarkdownImageTarget(reference.rawTarget)?.destination ?? '';
    if (parseAssetMarkdownUrl(target)) continue;
    unavailableCount += 1;
    text = `${text.slice(0, reference.start)}${UNAVAILABLE_IMAGE_PLACEHOLDER}${text.slice(reference.end)}`;
  }
  return {
    attachmentIds: unique(localized.attachmentIds),
    localizedCount: countAssetReferences(text),
    text,
    unavailableCount
  };
}

function countImageReferences(markdown: string) {
  return collectMarkdownImageReferences(markdown).length;
}

function countAssetReferences(markdown: string) {
  return collectMarkdownImageReferences(markdown).filter((reference) => {
    const target = parseMarkdownImageTarget(reference.rawTarget)?.destination ?? '';
    return Boolean(parseAssetMarkdownUrl(target));
  }).length;
}

function countUnavailablePlaceholders(markdown: string) {
  return markdown.split(UNAVAILABLE_IMAGE_PLACEHOLDER).length - 1;
}

function imageDegradedReason(input: {
  conversionDroppedCount: number;
  sourceBodyCount: number;
  unavailableBodyCount: number;
}) {
  if (input.unavailableBodyCount === 0 && input.conversionDroppedCount === 0) {
    return null;
  }
  return `Reader EPUB body images incomplete: source=${input.sourceBodyCount}; unavailable=${input.unavailableBodyCount}; conversion_dropped=${input.conversionDroppedCount}.`;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
