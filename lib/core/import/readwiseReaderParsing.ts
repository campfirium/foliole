import type { ImportSidecarHighlight } from './controlledContext.js';
import {
  extractReadwiseFullDocument,
  parseReadwiseFullDocumentImport
} from './readwiseFullDocumentParsing.js';
import type { ReadwiseReaderConfig } from './readwiseReaderSettings.js';

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

function stripMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, '$2')
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]+/g, ' ');
}

function compactWhitespace(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?，。！？；：、)\]])/g, '$1')
    .trim();
}

function decodeSeparator(value: string) {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeLinePrefixWhitespace(value: string) {
  return value.replace(/[ \t]+/g, '[ \\t]+');
}

export function normalizeReadwiseText(value: string) {
  return compactWhitespace(stripMarkdown(normalizeLineEndings(value)));
}

function stripReadwiseLinkTail(block: string) {
  return block
    .replace(/\s+\[\.\.\.]\s*\([^)]+\)/g, '')
    .replace(/\s+\(\[[^\]]+]\([^)]+\)\)\s*$/g, '')
    .replace(/\s+\([^()\n]+\)\s*$/g, '')
    .trim();
}

function splitKeywordTail(block: string, keyword: string) {
  if (!keyword.trim()) {
    return { before: block.trim(), value: '' };
  }
  const match = new RegExp(`(^|\\n|\\s)\\s*-?\\s*${escapeRegex(keyword)}\\s*([\\s\\S]*)$`, 'i').exec(block);
  if (match?.index === undefined) {
    return { before: block.trim(), value: '' };
  }
  return {
    before: block.slice(0, match.index).trim(),
    value: (match[2] ?? '').trim()
  };
}

function parseHighlightMetadata(block: string, tagKeyword: string, noteKeyword: string) {
  const withoutLinkTail = stripReadwiseLinkTail(block);
  const withoutTags = splitKeywordTail(withoutLinkTail, tagKeyword).before;
  const noteSplit = splitKeywordTail(withoutTags, noteKeyword);
  return {
    note: noteSplit.value,
    text: noteSplit.before.replace(/^[-*+]\s+/, '').replace(/^>\s+/, '').trim()
  };
}

function splitHighlightBlocks(content: string, separator: string) {
  const normalizedContent = normalizeLineEndings(content);
  const divider = separator.trim().length > 0 ? normalizeLineEndings(decodeSeparator(separator)) : '\n\n';
  const trimmedDivider = divider.trimStart();
  const trimmedContent = normalizedContent.trimStart();
  const linePrefixPattern = new RegExp(`^${escapeLinePrefixWhitespace(escapeRegex(trimmedDivider))}`, 'gm');
  const matches = [...normalizedContent.matchAll(linePrefixPattern)];
  if (!divider.includes('\n') && trimmedDivider && trimmedContent.startsWith(trimmedDivider) && matches.length > 1) {
    return matches
      .map((match, index) => {
        const start = match.index ?? 0;
        const end = matches[index + 1]?.index ?? normalizedContent.length;
        const block = normalizedContent.slice(start, end).trim();
        return block.replace(new RegExp(`^${escapeLinePrefixWhitespace(escapeRegex(trimmedDivider))}`), '').trim();
      })
      .filter(Boolean);
  }
  const literalBlocks = normalizedContent
    .split(divider)
    .map((part) => part.trim())
    .filter(Boolean);
  if (literalBlocks.length === 1) {
    const readwiseLinkFallbackBlocks = tryReadwiseLinkFallbackBlocks(normalizedContent);
    if (readwiseLinkFallbackBlocks) {
      return readwiseLinkFallbackBlocks;
    }
    const listBlocks = splitTopLevelListHighlights(normalizedContent);
    if (listBlocks.length > 1) {
      return listBlocks;
    }
  }
  return literalBlocks;
}

function splitTopLevelListHighlights(content: string) {
  const matches = [...content.matchAll(/^(?:-\s+|>\s+)/gm)];
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

function splitBlankLineHighlights(content: string) {
  return normalizeLineEndings(content)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isReadwiseLinkTerminatedHighlight(block: string) {
  return /\[\.\.\.]\(\s*https?:\/\/read(?:\.readwise)?\.io\/read\/[^)]+\s*\)\s*$/i.test(block.trim());
}

function tryReadwiseLinkFallbackBlocks(content: string) {
  const blocks = splitBlankLineHighlights(content);
  if (blocks.length <= 1) {
    return null;
  }
  const linkTerminatedCount = blocks.filter((block) => isReadwiseLinkTerminatedHighlight(block)).length;
  if (linkTerminatedCount >= Math.ceil(blocks.length * 0.6)) {
    return blocks;
  }
  return null;
}

export function extractReadwiseHighlightsSection(markdown: string, headings: string[]) {
  const normalized = normalizeLineEndings(markdown);
  const headingMatches = headings
    .filter((heading) => heading.trim().length > 0)
    .map((heading) => {
      const match = new RegExp(`^${escapeRegex(normalizeLineEndings(heading))}\\s*$`, 'im').exec(normalized);
      return match?.index ?? Number.POSITIVE_INFINITY;
    });
  const headingIndex = Math.min(...headingMatches, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(headingIndex)) {
    return normalized.trim();
  }
  const matchedHeading = headings.find((heading) => {
    if (!heading.trim()) {
      return false;
    }
    return new RegExp(`^${escapeRegex(normalizeLineEndings(heading))}\\s*$`, 'im').exec(normalized)?.index === headingIndex;
  });
  const section = normalized
    .slice(headingIndex + (matchedHeading ? normalizeLineEndings(matchedHeading).length : 0))
    .replace(/^\n+/, '');
  const nextHeadingIndex = section.search(/^## /m);
  return (nextHeadingIndex >= 0 ? section.slice(0, nextHeadingIndex) : section).trim();
}

export { extractReadwiseFullDocument };

export function transformReadwiseFullDocument(markdown: string) {
  return parseReadwiseFullDocumentImport(markdown).content;
}

export function extractReadwiseSidecarHighlights(
  articleMarkdown: string,
  config: Pick<ReadwiseReaderConfig, 'highlightSeparator' | 'highlightsHeading' | 'newHighlightsHeading' | 'noteKeyword' | 'tagKeyword'>
): ImportSidecarHighlight[] {
  return splitHighlightBlocks(
    extractReadwiseHighlightsSection(articleMarkdown, [config.highlightsHeading, config.newHighlightsHeading]),
    config.highlightSeparator
  )
    .map((block) => parseHighlightMetadata(block, config.tagKeyword, config.noteKeyword))
    .filter((highlight) => normalizeReadwiseText(highlight.text).length > 0)
    .map((highlight) => ({
      note: highlight.note || null,
      text: highlight.text
    }));
}
