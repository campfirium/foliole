export type MarkdownSyntaxVisibility = 'hidden' | 'visible';

export const MARKDOWN_SYNTAX_VISIBILITY_KEY = 'foliole-markdown-syntax-visibility';
export const MARKDOWN_SYNTAX_VISIBILITY_DEFAULT: MarkdownSyntaxVisibility = 'hidden';

function isMarkdownSyntaxVisibility(value: string): value is MarkdownSyntaxVisibility {
  return value === 'hidden' || value === 'visible';
}

export function getMarkdownSyntaxVisibility(): MarkdownSyntaxVisibility {
  if (typeof window === 'undefined') {
    return MARKDOWN_SYNTAX_VISIBILITY_DEFAULT;
  }

  const raw = window.localStorage.getItem(MARKDOWN_SYNTAX_VISIBILITY_KEY);
  if (!raw || !isMarkdownSyntaxVisibility(raw)) {
    return MARKDOWN_SYNTAX_VISIBILITY_DEFAULT;
  }
  return raw;
}

export function setMarkdownSyntaxVisibility(value: MarkdownSyntaxVisibility) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(MARKDOWN_SYNTAX_VISIBILITY_KEY, value);
}
