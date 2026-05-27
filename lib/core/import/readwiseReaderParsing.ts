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
    .replace(/!\[[^\]]*]\([^)]+\)/g, (match) => ` ${match} `)
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, '$2')
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/(?<!!)\[([^\]]+)]\([^)]+\)/g, '$1')
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

function normalizeHeadingLine(value: string) {
  return normalizeLineEndings(value).trim();
}

function matchesConfiguredHeading(line: string, heading: string) {
  const normalizedLine = normalizeHeadingLine(line);
  const normalizedHeading = normalizeHeadingLine(heading);
  if (!normalizedHeading) {
    return false;
  }
  return normalizedLine === normalizedHeading || normalizedLine.startsWith(`${normalizedHeading} `);
}

function matchesAnyConfiguredHeading(line: string, headings: string[]) {
  return headings.some((heading) => matchesConfiguredHeading(line, heading));
}

function isHighlightGroupHeading(line: string, headings: string[]) {
  if (!/^##\s+/u.test(line)) {
    return false;
  }
  const normalizedLine = normalizeHeadingLine(line).replace(/^##\s+/, '').toLowerCase();
  return matchesAnyConfiguredHeading(line, headings) || /\bhighlight(s)?\b/u.test(normalizedLine);
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

function stripReaderLinePrefix(line: string) {
  return line
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+•]\s+/, '')
    .trim();
}

function isReaderActionLine(line: string) {
  const stripped = stripReaderLinePrefix(line);
  return /^\[Quote\]\([^)]*mode=quote[^)]*\)$/u.test(stripped) ||
    /^\[\]\(javascript:void\(0\);?\)$/iu.test(stripped);
}

function stripReaderActionLines(block: string) {
  return normalizeLineEndings(block)
    .split('\n')
    .filter((line) => !isReaderActionLine(line))
    .join('\n');
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
  const withoutLinkTail = stripReadwiseLinkTail(stripReaderActionLines(block));
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
  const headingMatches = [...normalized.matchAll(/^## .+$/gm)]
    .filter((match) => isHighlightGroupHeading(match[0], headings));
  const firstHeading = headingMatches[0];
  if (!firstHeading || firstHeading.index === undefined) {
    return normalized.trim();
  }
  const section = normalized
    .slice(firstHeading.index + firstHeading[0].length)
    .replace(/^\n+/, '');
  const nextHeadingIndex = section
    .split('\n')
    .findIndex((line) => /^## /u.test(line) && !isHighlightGroupHeading(line, headings));
  const highlightSection = nextHeadingIndex >= 0
    ? section.split('\n').slice(0, nextHeadingIndex).join('\n')
    : section;
  return highlightSection
    .split('\n')
    .filter((line) => !isHighlightGroupHeading(line, headings))
    .join('\n')
    .trim();
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
