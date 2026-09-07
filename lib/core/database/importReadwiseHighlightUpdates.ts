import type { PreparedImportRecord } from '../import/contract.js';

import { applyImportedHighlightAnchors } from './importHighlightAnchors.js';

function normalizeImportedHighlightContent(content: string) {
  return content.replace(/\r\n?/g, '\n').trim();
}

function toUnmatchedHighlightRecords(input: PreparedImportRecord, existingHighlightContentSet: Set<string>) {
  return (input.unmatchedHighlights ?? [])
    .filter((highlight) => {
      const normalized = normalizeImportedHighlightContent(highlight.content);
      return normalized.length > 0 && (Boolean(highlight.nodeId) || !existingHighlightContentSet.has(normalized));
    })
    .map((highlight) => ({ ...highlight, locatorText: null }));
}

function toUnanchoredMatchedHighlightRecords(
  highlights: NonNullable<PreparedImportRecord['matchedHighlights']>,
  anchoredContents: Set<string>,
  anchoredNodeIds: Set<string>,
  existingHighlightContentSet: Set<string>
) {
  return highlights
    .filter((highlight) => {
      if (highlight.nodeId && anchoredNodeIds.has(highlight.nodeId)) return false;
      const normalized = normalizeImportedHighlightContent(highlight.content);
      return normalized.length > 0 && (Boolean(highlight.nodeId) || (
        !anchoredContents.has(normalized) && !existingHighlightContentSet.has(normalized)
      ));
    })
    .map((highlight) => ({ ...highlight, locatorText: null }));
}

function extractTopFrontmatter(content: string) {
  const normalized = content.replace(/\r\n?/g, '\n');
  const match = /^---\n[\s\S]*?\n---(?:\n+|$)/.exec(normalized);
  return match ? { body: normalized.slice(match[0].length), frontmatter: match[0].trimEnd() } : null;
}

function refreshReadwiseFrontmatter(existingContent: string, preparedContent: string) {
  const preparedFrontmatter = extractTopFrontmatter(preparedContent);
  if (!preparedFrontmatter) {
    return existingContent;
  }
  const existingFrontmatter = extractTopFrontmatter(existingContent);
  const body = existingFrontmatter ? existingFrontmatter.body : existingContent.replace(/\r\n?/g, '\n');
  return `${preparedFrontmatter.frontmatter}\n${body.replace(/^\n+/, '')}`;
}

export function needsReadwiseFrontmatterRefresh(existingContent: string, preparedContent: string) {
  const preparedFrontmatter = extractTopFrontmatter(preparedContent);
  if (!preparedFrontmatter) {
    return false;
  }
  return extractTopFrontmatter(existingContent)?.frontmatter !== preparedFrontmatter.frontmatter;
}

export function resolveReadwiseHighlightUpdate(input: {
  existingAnchoredChildContents?: string[];
  existingChildContents: string[];
  existingContent: string;
  prepared: PreparedImportRecord;
}) {
  const existingHighlightContentSet = new Set(
    input.existingChildContents.map((content) => normalizeImportedHighlightContent(content)).filter(Boolean)
  );
  const existingAnchoredHighlightContentSet = new Set(
    (input.existingAnchoredChildContents ?? input.existingChildContents)
      .map((content) => normalizeImportedHighlightContent(content))
      .filter(Boolean)
  );
  const newMatchedHighlights =
    input.prepared.matchedHighlights?.filter((highlight) => {
      const normalized = normalizeImportedHighlightContent(highlight.content);
      return normalized.length > 0 && (
        Boolean(highlight.nodeId) || !existingAnchoredHighlightContentSet.has(normalized)
      );
    }) ?? [];
  const content = refreshReadwiseFrontmatter(input.existingContent, input.prepared.content);
  const anchoredImport = applyImportedHighlightAnchors({
    content,
    highlights: newMatchedHighlights
  });
  const anchoredContents = new Set(
    anchoredImport.highlights.map((highlight) => normalizeImportedHighlightContent(highlight.content))
  );
  const anchoredNodeIds = new Set(
    anchoredImport.highlights.map((highlight) => highlight.nodeId).filter((id): id is string => Boolean(id))
  );

  return {
    content: anchoredImport.content,
    highlights: [
      ...anchoredImport.highlights,
      ...toUnanchoredMatchedHighlightRecords(
        newMatchedHighlights,
        anchoredContents,
        anchoredNodeIds,
        existingHighlightContentSet
      ),
      ...toUnmatchedHighlightRecords(input.prepared, existingHighlightContentSet)
    ]
  };
}
