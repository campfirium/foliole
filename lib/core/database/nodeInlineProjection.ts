/** Only leading frontmatter is retained beside a hashed body for lightweight lists. */
export function projectNodeInlineContent(content: string) {
  const lines = content.split(/\r?\n/);
  if (!/^\s*---\s*$/.test(lines[0] ?? '')) return '';
  for (let index = 1; index < lines.length; index++) {
    if (/^\s*---\s*$/.test(lines[index]!)) return lines.slice(0, index + 1).join('\n') + '\n';
  }
  return '';
}
