const BLOCKQUOTE_PATTERN = /^\s{0,3}>/;
const FENCE_PATTERN = /^\s{0,3}(```|~~~)/;
const HEADING_PATTERN = /^(\s{0,3})(#+)([ \t]+.*)$/;
const GENERIC_PAGE_TITLES = new Set(['unknown', 'untitled', '未知']);

export function normalizePageTitle(title: string | null) {
  const normalized = title?.trim();
  if (!normalized) {
    return null;
  }
  return GENERIC_PAGE_TITLES.has(normalized.toLowerCase()) ? null : normalized;
}

export function increaseMarkdownHeadingLevels(content: string) {
  const lines = content.split('\n');
  let activeFence: '```' | '~~~' | null = null;

  return lines
    .map((line) => {
      if (BLOCKQUOTE_PATTERN.test(line)) {
        return line;
      }
      const fenceMatch = line.match(FENCE_PATTERN);
      if (fenceMatch) {
        const marker = fenceMatch[1] as '```' | '~~~';
        activeFence = activeFence === marker ? null : marker;
        return line;
      }
      if (activeFence) {
        return line;
      }
      const headingMatch = line.match(HEADING_PATTERN);
      if (!headingMatch) {
        return line;
      }
      return `${headingMatch[1]}${headingMatch[2]}#${headingMatch[3]}`;
    })
    .join('\n');
}

export function extractFirstMarkdownHeadingText(content: string) {
  for (const line of content.split('\n')) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) {
      continue;
    }
    const value = match[1]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function extractFirstMeaningfulBodyLine(content: string) {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || /^#+\s/.test(trimmed) || /^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return null;
}

export function isCoverLikeChapter(chapter: { content: string; title: string }, chapterPath: string, coverPaths: ReadonlySet<string>) {
  if (coverPaths.has(chapterPath)) {
    return true;
  }
  const normalizedTitle = chapter.title.trim().toLowerCase();
  if (normalizedTitle !== 'cover') {
    return false;
  }
  const body = chapter.content
    .replace(/^#\s+.*(?:\n\n|$)/, '')
    .trim();
  return /^!\[[^\]]*\]\([^)]+\)$/.test(body);
}
