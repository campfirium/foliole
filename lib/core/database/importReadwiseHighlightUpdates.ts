import { stripAnchorBlocks } from '../../../src/features/editor/model/anchorBlocks.js';
import type { PreparedImportRecord } from '../import/contract.js';

import { applyImportedHighlightAnchors } from './importHighlightAnchors.js';

function normalizeImportedHighlightContent(content: string) {
  return content.replace(/\r\n?/g, '\n').trim();
}

function splitUnmatchedAppendix(content: string) {
  const marker = '\n\n## Unmatched Sidecar Highlights\n\n';
  const index = content.indexOf(marker);
  if (index < 0) {
    return {
      body: content,
      unmatchedHighlights: [] as string[]
    };
  }
  const body = content.slice(0, index);
  const appendix = content.slice(index + marker.length);
  const unmatchedHighlights = appendix
    .split('\n')
    .map((line) => /^-\s+[^:]+:\s*(.+?)\s*$/.exec(line)?.[1]?.trim() ?? '')
    .filter(Boolean);
  return { body, unmatchedHighlights };
}

function appendUnmatchedAppendix(body: string, unmatchedHighlights: string[]) {
  if (unmatchedHighlights.length === 0) {
    return body;
  }
  return `${body}\n\n## Unmatched Sidecar Highlights\n\n${unmatchedHighlights
    .map((text, index) => `- Highlight ${index + 1}: ${text}`)
    .join('\n')}`;
}

export function resolveReadwiseHighlightUpdate(input: {
  existingChildContents: string[];
  existingContent: string;
  prepared: PreparedImportRecord;
}) {
  const existingContent = splitUnmatchedAppendix(input.existingContent);
  const existingHighlightContentSet = new Set(
    input.existingChildContents.map((content) => normalizeImportedHighlightContent(content)).filter(Boolean)
  );
  const newMatchedHighlights =
    input.prepared.matchedHighlights?.filter((highlight) => {
      const normalized = normalizeImportedHighlightContent(highlight.content);
      return normalized.length > 0 && !existingHighlightContentSet.has(normalized);
    }) ?? [];
  const anchoredImport = applyImportedHighlightAnchors({
    content: stripAnchorBlocks(existingContent.body),
    highlights: newMatchedHighlights
  });
  const nextUnmatchedHighlights = [
    ...existingContent.unmatchedHighlights,
    ...splitUnmatchedAppendix(input.prepared.content).unmatchedHighlights.filter((highlight) => {
      const normalized = normalizeImportedHighlightContent(highlight);
      return (
        normalized.length > 0 &&
        !existingHighlightContentSet.has(normalized) &&
        !existingContent.unmatchedHighlights.some((entry) => normalizeImportedHighlightContent(entry) === normalized)
      );
    })
  ];

  return {
    content: appendUnmatchedAppendix(anchoredImport.content, nextUnmatchedHighlights),
    highlights: anchoredImport.highlights
  };
}
