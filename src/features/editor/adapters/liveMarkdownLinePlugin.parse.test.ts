import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setEditorDisplayMode } from '../model/editorDisplayMode';
import { folioleMarkdownParser } from '../model/folioleMarkdownParser';

import { buildPreviewAtomicRangeSet } from './liveMarkdownAtomicRanges';
import { buildPreviewDecorationSet, buildSourceDecorationSet } from './liveMarkdownDecorations';
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

  it('builds preview decorations from pre-parsed markdown without internal reparses', () => {
    const view = createView(COMPLEX_MARKDOWN);
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    const parsed = { markdownTree: folioleMarkdownParser.parse(COMPLEX_MARKDOWN), source: COMPLEX_MARKDOWN };
    parseSpy.mockClear();

    buildPreviewDecorationSet(view, parsed, createDecorationContext());

    expect(countFullSourceParses(parseSpy)).toBe(0);
    view.destroy();
  });

  it('builds source decorations with one shared markdown parse', () => {
    const view = createView(COMPLEX_MARKDOWN);
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    parseSpy.mockClear();

    buildSourceDecorationSet(view);

    expect(countFullSourceParses(parseSpy)).toBe(1);
    view.destroy();
  });
});

const COMPLEX_MARKDOWN = [
  '# Title',
  '',
  '> [!note] Callout',
  '',
  '![Cover](https://example.com/a.png)',
  '',
  '[Forum title]',
  '(https://example.com/forum)',
  '',
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '```ts',
  'const x = 1',
  '```',
  '',
  '[ref]: https://example.com'
].join('\n');

function createView(doc: string) {
  const parent = document.createElement('div');
  document.body.append(parent);
  return new EditorView({ doc, parent });
}

function createDecorationContext(): Parameters<typeof buildPreviewDecorationSet>[2] {
  return {
    activePosition: null,
    cursorLineNumber: null,
    editedMathRange: null,
    hideTitleHeading: false,
    imageClozePresentationVersion: 0,
    localDocumentPath: null,
    markdownSyntaxVisible: false,
    nodeId: null,
    onMissingAttachmentResource: null
  };
}

function countFullSourceParses(parseSpy: ReturnType<typeof vi.spyOn>) {
  return parseSpy.mock.calls.filter(([source]: [unknown]) => source === COMPLEX_MARKDOWN).length;
}
