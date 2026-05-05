const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const WIKILINK_WRAPPER_PATTERN = /\[\[([^\]]+)\]\]/g;
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;

export const NODE_OPENING_PREVIEW_FALLBACK = 'No opening yet.';
export const PDF_READER_PLACEHOLDER_TEXT = 'Linked PDF source ready for the reader surface.';

const NODE_OPENING_PREVIEW_MAX_LENGTH = 100;
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
    .replace(ANCHOR_TAG_PATTERN, '')
    .split(/\r?\n\r?\n/)
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

  const slicedValue = value.slice(0, NODE_OPENING_PREVIEW_MAX_LENGTH).trimEnd();
  const lastSpaceIndex = slicedValue.lastIndexOf(' ');
  const safeValue = lastSpaceIndex >= 60 ? slicedValue.slice(0, lastSpaceIndex) : slicedValue;

  return `${safeValue.trimEnd()}…`;
}

function stripLeadingTitleEcho(paragraph: string, normalizedTitle: string) {
  let nextParagraph = paragraph;
  const lowerTitle = normalizedTitle.toLocaleLowerCase();

  while (normalizedTitle && nextParagraph.toLocaleLowerCase().startsWith(lowerTitle)) {
    nextParagraph = nextParagraph.slice(normalizedTitle.length).replace(/^[\s:：,-]+/, '').trim();
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
  const strippedOpening =
    paragraphs
      .map((paragraph) => stripLeadingTitleEcho(paragraph, normalizedTitle))
      .find((paragraph) => !isIgnoredOpeningValue(paragraph)) ?? '';
  const opening = strippedOpening || NODE_OPENING_PREVIEW_FALLBACK;

  return truncatePreview(opening);
}
