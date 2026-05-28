import { describe, expect, it } from 'vitest';

import {
  getMarkdownSyntaxVisibility,
  MARKDOWN_SYNTAX_VISIBILITY_DEFAULT,
  MARKDOWN_SYNTAX_VISIBILITY_KEY,
  setMarkdownSyntaxVisibility
} from './markdownSyntaxSetting';

describe('markdownSyntaxSetting', () => {
  it('defaults to hidden when no value is set', () => {
    localStorage.removeItem(MARKDOWN_SYNTAX_VISIBILITY_KEY);
    expect(getMarkdownSyntaxVisibility()).toBe(MARKDOWN_SYNTAX_VISIBILITY_DEFAULT);
  });

  it('keeps syntax markers hidden even when callers request the old visible mode', () => {
    setMarkdownSyntaxVisibility('visible');
    expect(getMarkdownSyntaxVisibility()).toBe('hidden');
    expect(localStorage.getItem(MARKDOWN_SYNTAX_VISIBILITY_KEY)).toBe('hidden');

    setMarkdownSyntaxVisibility('hidden');
    expect(getMarkdownSyntaxVisibility()).toBe('hidden');
  });

  it('falls back to default for invalid stored values', () => {
    localStorage.setItem(MARKDOWN_SYNTAX_VISIBILITY_KEY, 'invalid');
    expect(getMarkdownSyntaxVisibility()).toBe(MARKDOWN_SYNTAX_VISIBILITY_DEFAULT);
  });
});
