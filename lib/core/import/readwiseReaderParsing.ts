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

function extractReadwiseDocumentTitle(markdown: string) {
  const normalized = normalizeLineEndings(markdown);
  const match = normalized.match(/^# (.+?)\s*$/m);
  return match?.[1]?.trim() ?? '';
}

function bodyStartsWithLevelOneHeading(markdown: string) {
  return /^#\s+\S/m.test(markdown);
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
          .replace(new RegExp(`\\s+-?\\s*${escapeRegex(keyword)}\\s*[\\s\\S]*$`, 'i'), '')
          .replace(new RegExp(`(^|\\n)\\s*-?\\s*${escapeRegex(keyword)}\\s*[\\s\\S]*$`, 'i'), '$1')
          .trim(),
      block
        .replace(/\s+\[\.\.\.]\s*\([^)]+\)/g, '')
        .replace(/\s+\(\[[^\]]+]\([^)]+\)\)\s*$/g, '')
        .replace(/\s+\([^()\n]+\)\s*$/g, '')
        .trim()
    )
    .trim();
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

export function transformReadwiseFullDocument(markdown: string, articleMarkdown = '') {
  const metadata = parseReadwiseMetadataSection(markdown);
  const frontmatter = renderReadwiseFrontmatter(metadata);
  const body = extractReadwiseFullDocument(markdown);
  const title = extractReadwiseDocumentTitle(articleMarkdown);
  const bodyWithTitle = title && !bodyStartsWithLevelOneHeading(body) ? `# ${title}\n\n${body}` : body;
  if (!frontmatter) {
    return bodyWithTitle;
  }
  if (!bodyWithTitle) {
    return frontmatter;
  }
  return `${frontmatter}\n\n${bodyWithTitle}`;
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
