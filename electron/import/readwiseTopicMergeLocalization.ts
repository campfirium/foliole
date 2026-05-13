import fs from 'node:fs/promises';

import type { ImportSidecarHighlight } from '../../lib/core/import/controlledContext.js';

import { ImageLocalizationContext } from './imageLocalizationContext.js';

function normalizeHighlightContent(content: string) {
  return content.replace(/\r\n?/g, '\n').trim();
}

export function filterNewHighlightSidecar(
  highlightSidecar: ImportSidecarHighlight[],
  existingHighlightContentSet: Set<string>
) {
  return highlightSidecar.filter((highlight) => {
    const normalized = normalizeHighlightContent(highlight.text);
    return normalized.length > 0 && !existingHighlightContentSet.has(normalized);
  });
}

export async function localizeReadwiseTopicMergeTexts(sourceContent: string, highlightFilePath: string) {
  const context = new ImageLocalizationContext();
  const [source, highlight] = await Promise.all([
    context.localizeMarkdown(sourceContent),
    fs.readFile(highlightFilePath, 'utf8').then((content) => context.localizeMarkdown(content))
  ]);
  return {
    attachmentIds: [...new Set([...source.attachmentIds, ...highlight.attachmentIds])],
    highlightMarkdown: highlight.text,
    sourceContent: source.text
  };
}
