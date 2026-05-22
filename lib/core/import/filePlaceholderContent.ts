import type { ImportSidecarHighlight } from './controlledContext.js';

const FILE_PLACEHOLDER_RE = /Full text .* document is an? (PDF|EPUB)/i;

export function isOriginalFilePlaceholderContent(content: string) {
  return FILE_PLACEHOLDER_RE.test(content);
}

export function appendFilePlaceholderHighlights(
  content: string,
  highlights: readonly ImportSidecarHighlight[],
  options: { summary?: string | null } = {}
) {
  if (!isOriginalFilePlaceholderContent(content)) {
    return content;
  }
  const summary = options.summary?.trim();
  return [
    removeSummaryFrontmatterLine(content.trimEnd(), summary),
    ...(summary ? ['', '## Summary', summary] : []),
    '',
    '## Highlights',
    formatHighlightCount(highlights.length),
    ...highlights.flatMap((highlight) => ['', formatHighlightBullet(highlight.text)])
  ].join('\n');
}

function removeSummaryFrontmatterLine(content: string, summary: string | undefined) {
  if (!summary || !content.startsWith('---\n')) {
    return content;
  }
  const frontmatterEnd = content.indexOf('\n---', 4);
  if (frontmatterEnd < 0) {
    return content;
  }
  const frontmatter = content.slice(4, frontmatterEnd);
  const body = content.slice(frontmatterEnd);
  const filteredFrontmatter = frontmatter
    .split('\n')
    .filter((line) => !/^summary\s*:/i.test(line.trim()))
    .join('\n')
    .trim();
  return filteredFrontmatter ? `---\n${filteredFrontmatter}${body}` : body.replace(/^\n---\n*/, '');
}

function formatHighlightCount(count: number) {
  if (count === 0) {
    return 'No highlights yet';
  }
  return count === 1 ? '1 highlight' : `${count} highlights`;
}

function formatHighlightBullet(text: string) {
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const [firstLine, ...restLines] = lines.length > 0 ? lines : [text.trim()];
  return [`- ${firstLine}`, ...restLines.map((line) => `  ${line}`)].join('\n');
}
