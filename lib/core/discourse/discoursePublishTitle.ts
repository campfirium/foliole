function removeFrontmatter(content: string) {
  if (!content.startsWith('---\n')) return content;
  const closeIndex = content.indexOf('\n---', 4);
  if (closeIndex < 0) return content;
  const afterClose = content.indexOf('\n', closeIndex + 4);
  return afterClose < 0 ? '' : content.slice(afterClose + 1);
}

function cleanHeadingTitle(value: string) {
  return value.replace(/\s+#+\s*$/u, '').trim();
}

export function extractDiscoursePublishTitle(content: string, fallback: string) {
  for (const line of removeFrontmatter(content).split(/\r?\n/u)) {
    const match = /^#(?!#)\s+(.+)$/u.exec(line.trim());
    if (!match) continue;
    const title = cleanHeadingTitle(match[1] ?? '');
    if (title) return title;
  }
  return fallback.trim() || 'Untitled';
}
