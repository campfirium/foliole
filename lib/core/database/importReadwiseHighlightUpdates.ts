import type { PreparedImportRecord } from '../import/contract.js';

import { applyImportedHighlightAnchors } from './importHighlightAnchors.js';

function normalizeImportedHighlightContent(content: string) {
  return content.replace(/\r\n?/g, '\n').trim();
}

function toUnmatchedHighlightRecords(input: PreparedImportRecord, existingHighlightContentSet: Set<string>) {
  return (input.unmatchedHighlights ?? [])
    .filter((highlight) => {
      const normalized = normalizeImportedHighlightContent(highlight.content);
      return normalized.length > 0 && !existingHighlightContentSet.has(normalized);
    })
    .map((highlight) => ({ content: highlight.content, label: highlight.label, locatorText: null }));
}

export function resolveReadwiseHighlightUpdate(input: {
  existingChildContents: string[];
  existingContent: string;
  prepared: PreparedImportRecord;
}) {
  const existingHighlightContentSet = new Set(
    input.existingChildContents.map((content) => normalizeImportedHighlightContent(content)).filter(Boolean)
  );
  const newMatchedHighlights =
    input.prepared.matchedHighlights?.filter((highlight) => {
      const normalized = normalizeImportedHighlightContent(highlight.content);
      return normalized.length > 0 && !existingHighlightContentSet.has(normalized);
    }) ?? [];
  const anchoredImport = applyImportedHighlightAnchors({
    content: input.existingContent,
    highlights: newMatchedHighlights
  });

  return {
    content: anchoredImport.content,
    highlights: [
      ...anchoredImport.highlights,
      ...toUnmatchedHighlightRecords(input.prepared, existingHighlightContentSet)
    ]
  };
}
