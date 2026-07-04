import { NODE_TITLE_MAX_CHARS } from '../../../shared/config/nodeTitleConfig';

const FENCE_PATTERN = /^\s{0,3}(```|~~~)/;
const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const LEVEL_ONE_HEADING_PATTERN = /^(\s{0,3})#\s+(.+?)\s*#*\s*$/;

export interface ArticleTitleHeading {
  lineIndex: number;
  title: string;
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, NODE_TITLE_MAX_CHARS);
}

function collectArticleTitleHeadings(content: string) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const headings: ArticleTitleHeading[] = [];
  let activeFence: '```' | '~~~' | null = null;
  let inFrontmatter = FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    if (lineIndex > 0 && inFrontmatter && FRONTMATTER_DELIMITER_PATTERN.test(line)) {
      inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) continue;

    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const marker = fenceMatch[1] as '```' | '~~~';
      activeFence = activeFence === marker ? null : marker;
      continue;
    }
    if (activeFence) continue;

    const headingMatch = line.match(LEVEL_ONE_HEADING_PATTERN);
    const title = headingMatch ? stripInlineMarkdown(headingMatch[2] ?? '') : '';
    if (title) headings.push({ lineIndex, title });
  }
  return headings;
}

export function extractUniqueArticleTitleHeading(content: string) {
  const headings = collectArticleTitleHeadings(content);
  return headings.length === 1 ? headings[0] ?? null : null;
}

export function replaceUniqueArticleTitleHeading(content: string, nextTitle: string) {
  const heading = extractUniqueArticleTitleHeading(content);
  if (!heading) return null;
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  lines[heading.lineIndex] = `# ${nextTitle.trim()}`;
  return lines.join('\n');
}
