import { afterEach, describe, expect, it, vi } from 'vitest';

import { setEditorDisplayMode } from '../model/editorDisplayMode';
import { folioleMarkdownParser } from '../model/folioleMarkdownParser';

import { buildPreviewAtomicRangeSet } from './liveMarkdownAtomicRanges';
import { shouldReparsePreviewMarkdown } from './liveMarkdownLinePlugin';

describe('live Markdown parse reuse', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('reuses pre-parsed preview markdown for atomic range builds', () => {
    setEditorDisplayMode('preview');
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    const source = 'Alpha **Beta**\n\n$$x$$';
    const parsed = { markdownTree: folioleMarkdownParser.parse(source), source };
    parseSpy.mockClear();

    buildPreviewAtomicRangeSet(parsed, null);

    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('does not reparse preview markdown for viewport-only updates', () => {
    expect(shouldReparsePreviewMarkdown({ docChanged: false })).toBe(false);
  });

});
