import type { ImportSidecarHighlight } from './controlledContext.js';

const FILE_PLACEHOLDER_RE = /Full text .* document is an? (PDF|EPUB)/i;

export function isOriginalFilePlaceholderContent(content: string) {
  return FILE_PLACEHOLDER_RE.test(content);
}

export function appendFilePlaceholderHighlights(content: string, highlights: readonly ImportSidecarHighlight[]) {
  if (!isOriginalFilePlaceholderContent(content)) {
    return content;
  }
  return [
    content.trimEnd(),
    '',
    '## Highlights',
    formatHighlightCount(highlights.length),
    ...highlights.flatMap((highlight) => ['', formatHighlightBullet(highlight.text)])
  ].join('\n');
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
