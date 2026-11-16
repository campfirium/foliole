const CONTEXT_BEFORE_MATCH = 36;
const CONTEXT_AFTER_MATCH = 420;

export function buildWorkspaceSearchTextExcerpt(content: string, query: string, knownMatchStart?: number) {
  const text = content.replace(/\s+/g, ' ').trim();
  const matchStart = query && text
    ? knownMatchStart ?? text.toLowerCase().indexOf(query)
    : -1;
  const start = Math.max(0, matchStart - CONTEXT_BEFORE_MATCH);
  const end = matchStart >= 0
    ? Math.min(text.length, matchStart + query.length + CONTEXT_AFTER_MATCH)
    : Math.min(text.length, CONTEXT_AFTER_MATCH);
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
}
