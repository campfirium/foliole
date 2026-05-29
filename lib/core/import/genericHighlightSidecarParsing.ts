import type { ImportSidecarHighlight } from './controlledContext.js';

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
}

function stripMarkdownPrefix(line: string) {
  return line
    .trim()
    .replace(/^>\s?/, '')
    .replace(/^[-*+•]\s+/, '')
    .trim();
}

function stripTrailingExportLink(value: string) {
  return value
    .replace(/\s+\[\.\.\.\]\s*\([^)]+\)\s*$/u, '')
    .replace(/\s+\(\[[^\]]+\]\([^)]+\)\)\s*$/u, '')
    .trim();
}

function normalizeCandidateText(value: string) {
  return stripTrailingExportLink(value
    .split('\n')
    .map(stripMarkdownPrefix)
    .filter(Boolean)
    .join('\n')
    .trim());
}

function isMetadataCandidate(value: string) {
  const normalized = value.trim();
  return (
    normalized.length === 0 ||
    /^=+$/u.test(normalized) ||
    /^#{1,6}\s+/u.test(normalized) ||
    /^---$/u.test(normalized) ||
    /^!\[[^\]]*\]\([^)]+\)$/u.test(normalized) ||
    /^(abstract|author|category|description|full title|source|summary|tags?|url)\s*:/iu.test(normalized)
  );
}

function toHighlight(value: string): ImportSidecarHighlight | null {
  const text = normalizeCandidateText(value);
  if (isMetadataCandidate(text)) {
    return null;
  }
  return text.length > 0 ? { text } : null;
}

function splitListItems(content: string) {
  const matches = [...content.matchAll(/^(?:[-*+•]\s+)/gmu)];
  if (matches.length <= 1) {
    return [];
  }
  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? content.length;
      return content.slice(start, end).trim();
    })
    .filter(Boolean);
}

function splitQuoteBlocks(content: string) {
  return content
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter((block) => block.split('\n').every((line) => line.trim().startsWith('>')));
}

function splitBlankBlocks(content: string) {
  return content
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean);
}

function selectCandidateBlocks(content: string) {
  const listItems = splitListItems(content);
  if (listItems.length > 0) {
    return listItems;
  }
  const quoteBlocks = splitQuoteBlocks(content);
  if (quoteBlocks.length > 0) {
    return quoteBlocks;
  }
  return splitBlankBlocks(content);
}

export function extractGenericSidecarHighlights(content: string): ImportSidecarHighlight[] {
  return selectCandidateBlocks(normalizeLineEndings(content))
    .map(toHighlight)
    .filter((highlight): highlight is ImportSidecarHighlight => highlight !== null);
}
