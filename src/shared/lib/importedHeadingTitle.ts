import { stripImportedAnchorMarkup } from '../../../lib/core/import/importAnchorMarkup';

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

export function extractImportedHeadingTitle(content: string) {
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

    const match = stripImportedAnchorMarkup(line).match(LEVEL_ONE_HEADING_PATTERN);
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
