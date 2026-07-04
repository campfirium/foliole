const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const LEVEL_ONE_HEADING_PATTERN = /^\s{0,3}#\s+\S/;

export function hasArticleBodyTitleHeading(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let lineIndex = 0;
  if (FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '')) {
    lineIndex += 1;
    while (lineIndex < lines.length && !FRONTMATTER_DELIMITER_PATTERN.test(lines[lineIndex] ?? '')) {
      lineIndex += 1;
    }
    if (lineIndex < lines.length) {
      lineIndex += 1;
    }
  }
  while (lineIndex < lines.length && (lines[lineIndex] ?? '').trim().length === 0) {
    lineIndex += 1;
  }
  return LEVEL_ONE_HEADING_PATTERN.test(lines[lineIndex] ?? '');
}
