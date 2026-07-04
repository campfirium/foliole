import path from 'node:path';

export type ImportNodeTitleStrategy = 'file_name' | 'heading';

const FENCE_PATTERN = /^\s{0,3}(```|~~~)/;
const LEVEL_ONE_HEADING_PATTERN = /^\s{0,3}#\s+(.+?)\s*#*\s*$/;

function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripImportFileExtension(sourceName: string) {
  const normalized = sourceName.replace(/\\/g, '/');
  const extension = path.extname(normalized);
  if (!extension) {
    return normalized;
  }
  return normalized.slice(0, -extension.length);
}

export function extractUniqueLevelOneHeading(content: string) {
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const headings: string[] = [];
  let activeFence: '```' | '~~~' | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const marker = fenceMatch[1] as '```' | '~~~';
      activeFence = activeFence === marker ? null : marker;
      continue;
    }
    if (activeFence) {
      continue;
    }

    const match = line.match(LEVEL_ONE_HEADING_PATTERN);
    if (!match) {
      continue;
    }
    const text = stripInlineMarkdown(match[1] ?? '');
    if (!text) {
      continue;
    }
    headings.push(text);
    if (headings.length > 1) {
      return null;
    }
  }

  return headings[0] ?? null;
}

export function shouldHideImportedTitleHeading(content: string) {
  return extractUniqueLevelOneHeading(content) !== null;
}

export function resolveImportedNodeTitle(input: {
  content: string;
  sourceName: string;
  titleStrategy: ImportNodeTitleStrategy;
}) {
  const fallbackTitle = stripImportFileExtension(input.sourceName).trim();
  const headingTitle = extractUniqueLevelOneHeading(input.content);
  if (headingTitle) {
    return headingTitle;
  }
  return fallbackTitle || input.sourceName.trim() || 'Untitled';
}
