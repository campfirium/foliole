export type MarkdownTableInlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'strikethrough'; text: string }
  | { href: string; kind: 'autolink'; text: string };

const INLINE_TABLE_TOKEN_PATTERN =
  /(\*\*|__)(.+?)\1|~~(.+?)~~|\b(?:https?:\/\/[^\s<>()\]]+|www\.[^\s<>()\]]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const AUTOLINK_TRAILING_PUNCTUATION_PATTERN = /[.,;:!?]+$/;

function normalizeAutolinkHref(text: string) {
  if (text.startsWith('www.')) return `https://${text}`;
  if (text.includes('@') && !text.includes('://')) return `mailto:${text}`;
  return text;
}

function createAutolinkTokens(rawText: string): MarkdownTableInlineToken[] {
  const linkText = rawText.replace(AUTOLINK_TRAILING_PUNCTUATION_PATTERN, '');
  const trailingText = rawText.slice(linkText.length);
  const tokens: MarkdownTableInlineToken[] = [
    { href: normalizeAutolinkHref(linkText), kind: 'autolink', text: linkText }
  ];
  if (trailingText) tokens.push({ kind: 'text', text: trailingText });
  return tokens;
}

export function tokenizeMarkdownTableInlineText(text: string): MarkdownTableInlineToken[] {
  const tokens: MarkdownTableInlineToken[] = [];
  let cursor = 0;
  let match = INLINE_TABLE_TOKEN_PATTERN.exec(text);

  while (match) {
    const start = match.index;
    if (start > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, start) });

    const matchText = match[0] ?? '';
    if (match[1]) {
      tokens.push({ kind: 'strong', text: match[2] ?? '' });
    } else if (matchText.startsWith('~~')) {
      tokens.push({ kind: 'strikethrough', text: match[3] ?? '' });
    } else {
      tokens.push(...createAutolinkTokens(matchText));
    }

    cursor = start + matchText.length;
    match = INLINE_TABLE_TOKEN_PATTERN.exec(text);
  }

  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) });
  INLINE_TABLE_TOKEN_PATTERN.lastIndex = 0;
  return tokens;
}
