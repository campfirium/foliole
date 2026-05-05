import type { ImportSidecarHighlight } from './controlledContext.js';
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
  return value.replace(/\s+/g, ' ').trim();
}

function decodeSeparator(value: string) {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeReadwiseText(value: string) {
  return compactWhitespace(stripMarkdown(normalizeLineEndings(value)));
}

function slugifyMetadataKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseReadwiseMetadataSection(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const match = /^## Metadata[^\n]*\n([\s\S]*?)(?=^## |\s*$)/im.exec(normalized);
  if (!match) {
    return [];
  }
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const entry = /^-?\s*([^:]+):\s*(.+?)\s*$/.exec(line);
      if (!entry) {
        return [];
      }
      const key = slugifyMetadataKey(entry[1]);
      const value = entry[2].trim();
      return key && value ? [{ key, value }] : [];
    });
}

function renderReadwiseFrontmatter(metadata: Array<{ key: string; value: string }>) {
  if (metadata.length === 0) {
    return '';
  }
  return ['---', ...metadata.map(({ key, value }) => `${key}: ${value}`), '---'].join('\n');
}

function trimHighlightMetadata(block: string, tagKeyword: string, noteKeyword: string) {
  const metadataKeywords = [tagKeyword, noteKeyword].filter((value) => value.trim().length > 0);
  return metadataKeywords
    .reduce(
      (current, keyword) =>
        current
          .replace(new RegExp(`\\s+${escapeRegex(keyword)}\\s*[\\s\\S]*$`, 'i'), '')
          .replace(new RegExp(`(^|\\n)\\s*${escapeRegex(keyword)}\\s*[\\s\\S]*$`, 'i'), '$1')
          .trim(),
      block
        .replace(/\s+\[\.\.\.]\s*\([^)]+\)/g, '')
        .replace(/\s+\([^()\n]+\)\s*$/g, '')
        .trim()
    )
    .trim();
}

function splitHighlightBlocks(content: string, separator: string) {
  const normalizedContent = normalizeLineEndings(content);
  const divider = separator.trim().length > 0 ? normalizeLineEndings(decodeSeparator(separator)) : '\n\n';
  return normalizedContent
    .split(divider)
    .map((part) => part.trim())
    .filter(Boolean);
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

export function extractReadwiseFullDocument(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const matches = [...normalized.matchAll(/^## Full Document[^\n]*$/gim)];
  const lastHeading = matches.at(-1);
  if (lastHeading?.index === undefined) {
    return normalized.trim();
  }
  const section = normalized.slice(lastHeading.index + lastHeading[0].length).replace(/^\n+/, '');
  const nextHeadingIndex = section.search(/^## /m);
  return (nextHeadingIndex >= 0 ? section.slice(0, nextHeadingIndex) : section).trim();
}

export function transformReadwiseFullDocument(markdown: string) {
  const metadata = parseReadwiseMetadataSection(markdown);
  const frontmatter = renderReadwiseFrontmatter(metadata);
  const body = extractReadwiseFullDocument(markdown);
  if (!frontmatter) {
    return body;
  }
  if (!body) {
    return frontmatter;
  }
  return `${frontmatter}\n\n${body}`;
}

export function extractReadwiseSidecarHighlights(
  articleMarkdown: string,
  config: Pick<ReadwiseReaderConfig, 'highlightSeparator' | 'highlightsHeading' | 'newHighlightsHeading' | 'noteKeyword' | 'tagKeyword'>
): ImportSidecarHighlight[] {
  return splitHighlightBlocks(
    extractReadwiseHighlightsSection(articleMarkdown, [config.highlightsHeading, config.newHighlightsHeading]),
    config.highlightSeparator
  )
    .map((block) => trimHighlightMetadata(block, config.tagKeyword, config.noteKeyword))
    .filter((text) => normalizeReadwiseText(text).length > 0)
    .map((text) => ({ text }));
}
