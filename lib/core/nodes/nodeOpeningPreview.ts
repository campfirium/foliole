import { stripAnchorBlocks } from '../../../src/features/editor/model/anchorBlocks.js';

const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const WIKILINK_WRAPPER_PATTERN = /\[\[([^\]]+)\]\]/g;

export const NODE_OPENING_PREVIEW_FALLBACK = 'No opening yet.';
export const PDF_READER_PLACEHOLDER_TEXT = 'Linked PDF source ready for the reader surface.';

const NODE_OPENING_PREVIEW_MAX_LENGTH = 200;
const OPENING_PREVIEW_IGNORED_VALUES = new Set([
  'cover',
  'cover image',
  'title page',
  '封面',
  PDF_READER_PLACEHOLDER_TEXT.toLocaleLowerCase()
]);

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function stripChapterPrefix(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const strippedChinese = trimmed.replace(/^\s*第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[章节回部卷篇]\s*[:：、.\-)]?\s*/u, '');
  const strippedEnglish = strippedChinese.replace(/^\s*chapter\s+(?:\d+|[ivxlcdm]+)\s*[:：.\-)]?\s*/iu, '');
  return strippedEnglish.trim();
}

function stripLeadingFrontmatter(content: string) {
  const lines = content.split('\n');
  if (lines.length < 3 || !FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '')) {
    return content;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_DELIMITER_PATTERN.test(lines[index] ?? '')) {
      return lines.slice(index + 1).join('\n');
    }
  }

  return content;
}

function stripLeadingTitleHeading(content: string) {
  const lines = content.split(/\r?\n/);
  const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonEmptyLineIndex < 0) {
    return content;
  }

  const firstNonEmptyLine = lines[firstNonEmptyLineIndex]?.trim() ?? '';
  if (!/^#\s+/.test(firstNonEmptyLine)) {
    return content;
  }

  return lines.slice(firstNonEmptyLineIndex + 1).join('\n').trimStart();
}

function stripMarkdownLinePrefix(line: string) {
  return line
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s+/, '');
}

function stripMarkdownInline(value: string) {
  return value
    .replace(WIKILINK_WRAPPER_PATTERN, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]+/g, '');
}

function getNormalizedParagraphs(content: string) {
  return stripLeadingTitleHeading(stripLeadingFrontmatter(content))
    .replaceAll('\r\n', '\n')
    .split(/\n{2,}/)
    .map((paragraph) => stripAnchorBlocks(paragraph))
    .map((paragraph) =>
      stripMarkdownInline(
        paragraph
          .split(/\r?\n/)
          .map((line) => stripMarkdownLinePrefix(line))
          .join(' ')
      )
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

function truncatePreview(value: string) {
  if (value.length <= NODE_OPENING_PREVIEW_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, NODE_OPENING_PREVIEW_MAX_LENGTH).trimEnd()}…`;
}

function stripLeadingTitleEcho(paragraph: string, normalizedTitle: string) {
  let nextParagraph = paragraph;
  const lowerTitle = normalizedTitle.toLocaleLowerCase();
  const strippedTitle = stripChapterPrefix(normalizedTitle);
  const lowerStrippedTitle = strippedTitle.toLocaleLowerCase();

  while (normalizedTitle && nextParagraph.toLocaleLowerCase().startsWith(lowerTitle)) {
    nextParagraph = nextParagraph.slice(normalizedTitle.length).replace(/^[\s:：,-]+/, '').trim();
  }

  while (lowerStrippedTitle) {
    const strippedParagraph = stripChapterPrefix(nextParagraph);
    if (!strippedParagraph.toLocaleLowerCase().startsWith(lowerStrippedTitle)) {
      break;
    }
    nextParagraph = strippedParagraph.slice(strippedTitle.length).replace(/^[\s:：,-]+/, '').trim();
  }

  return nextParagraph;
}

function isIgnoredOpeningValue(value: string) {
  const normalizedValue = normalizeText(value).toLocaleLowerCase();
  return normalizedValue.length === 0 || OPENING_PREVIEW_IGNORED_VALUES.has(normalizedValue);
}

export function extractNodeOpeningPreview(content: string, title: string) {
  const paragraphs = getNormalizedParagraphs(content);
  if (paragraphs.length === 0) {
    return NODE_OPENING_PREVIEW_FALLBACK;
  }

  const normalizedTitle = normalizeText(title);
  const strippedParagraphs = paragraphs.map((paragraph) => stripLeadingTitleEcho(paragraph, normalizedTitle));
  const openingStartIndex = strippedParagraphs.findIndex((paragraph) => !isIgnoredOpeningValue(paragraph));
  const opening =
    openingStartIndex >= 0
      ? strippedParagraphs.slice(openingStartIndex).join(' ').trim()
      : NODE_OPENING_PREVIEW_FALLBACK;

  return truncatePreview(opening);
}

export function resolveNodeOpeningText(content: string, title: string) {
  const opening = extractNodeOpeningPreview(content, title);
  return opening === NODE_OPENING_PREVIEW_FALLBACK ? null : opening;
}
