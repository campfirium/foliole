import type { SuperMemoCitation } from '../../lib/core/import/superMemoCitation.js';

export { addSuperMemoCitation, describeSuperMemoCitation, type SuperMemoCitation } from '../../lib/core/import/superMemoCitation.js';

export function removeSuperMemoCitation(value: string, { placement, text }: SuperMemoCitation) {
  if (placement === 'body' || placement === 'content-end') {
    const suffix = '\n\n' + text;
    const start = value.lastIndexOf(suffix);
    const end = start + suffix.length;
    return start >= 0 && value.indexOf(suffix) === start && (end === value.length || value.startsWith('\n\n', end))
      ? value.slice(0, start) + value.slice(end) : null;
  }
  const frontMatter = /^---\n([\s\S]*?)\n---(?=\n|$)/u.exec(value);
  if (!frontMatter) return null;
  const header = frontMatter[1]!;
  const start = header.lastIndexOf(text);
  const end = start + text.length;
  if (start < 0 || header.indexOf(text) !== start ||
      (start > 0 && header[start - 1] !== '\n') || (end < header.length && header[end] !== '\n')) return null;
  const remaining = [header.slice(0, start).replace(/\n$/u, ''), header.slice(end).replace(/^\n/u, '')].filter(Boolean).join('\n');
  const body = value.slice(frontMatter[0].length);
  return remaining ? `---\n${remaining}\n---${body}` : body.replace(/^\n\n/u, '');
}
