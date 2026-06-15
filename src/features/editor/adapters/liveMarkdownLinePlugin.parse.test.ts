import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setEditorDisplayMode } from '../model/editorDisplayMode';
import { folioleMarkdownParser } from '../model/folioleMarkdownParser';

import { buildPreviewAtomicRangeSet } from './liveMarkdownAtomicRanges';
import { buildPreviewDecorationSet, buildSourceDecorationSet } from './liveMarkdownDecorations';
import {
  hasMarkdownDecorationContext,
  isPlainTextInputChange,
  shouldMapDocumentInputDecorations,
  shouldReparsePreviewMarkdown
} from './liveMarkdownLinePlugin';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('live Markdown parse reuse', () => {
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

describe('live Markdown plain text input reuse', () => {
  it('maps existing decorations while typing plain text in the editor', () => {
    expect(shouldMapDocumentInputDecorations({
      docChanged: true,
      editedMathRangeChanged: false,
      imageClozePresentationChanged: false,
      localDocumentPathChanged: false,
      nodeIdChanged: false,
      plainTextInputChange: true,
      textAnchorDecorationsChanged: false
    })).toBe(true);
  });

  it('treats plain prose as safe even when another document line has markdown', () => {
    const update = createTextInsertionUpdate('# Title\n\nThis is plain prose.', 28, '1');

    expect(isPlainTextInputChange(update as never)).toBe(true);
  });

  it('rebuilds when plain input edits a markdown decoration line', () => {
    const update = createTextInsertionUpdate('# Title\n\nThis is plain prose.', 3, '1');

    expect(isPlainTextInputChange(update as never)).toBe(false);
  });

  it('rebuilds when inserted text can introduce markdown structure', () => {
    const update = createTextInsertionUpdate('This is plain prose.', 18, '*');

    expect(isPlainTextInputChange(update as never)).toBe(false);
  });

  it('does not treat prose punctuation as markdown decoration context', () => {
    expect(hasMarkdownDecorationContext('This document intentionally contains ordinary prose.')).toBe(false);
  });

  it('rebuilds editor decorations for structural presentation changes', () => {
    expect(shouldMapDocumentInputDecorations({
      docChanged: true,
      editedMathRangeChanged: false,
      imageClozePresentationChanged: true,
      localDocumentPathChanged: false,
      nodeIdChanged: false,
      plainTextInputChange: true,
      textAnchorDecorationsChanged: false
    })).toBe(false);
  });

  it('rebuilds editor decorations for markdown structure input', () => {
    expect(shouldMapDocumentInputDecorations({
      docChanged: true,
      editedMathRangeChanged: false,
      imageClozePresentationChanged: false,
      localDocumentPathChanged: false,
      nodeIdChanged: false,
      plainTextInputChange: false,
      textAnchorDecorationsChanged: false
    })).toBe(false);
  });
});

describe('live Markdown decoration reuse', () => {
  it('builds preview decorations from pre-parsed markdown without internal reparses', () => {
    const view = createView(COMPLEX_MARKDOWN);
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    const parsed = { markdownTree: folioleMarkdownParser.parse(COMPLEX_MARKDOWN), source: COMPLEX_MARKDOWN };
    parseSpy.mockClear();

    buildPreviewDecorationSet(view, parsed, createDecorationContext());

    expect(countFullSourceParses(parseSpy)).toBe(0);
    view.destroy();
  });

  it('builds source decorations from CodeMirror syntax tree without a direct parser reparse', () => {
    const view = createView(COMPLEX_MARKDOWN);
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    parseSpy.mockClear();

    buildSourceDecorationSet(view);

    expect(countFullSourceParses(parseSpy)).toBe(0);
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

function createTextInsertionUpdate(text: string, position: number, insertedText: string) {
  const lines = text.split('\n');
  return {
    changes: {
      iterChanges(callback: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) {
        callback(position, position, position, position + insertedText.length, { toString: () => insertedText });
      }
    },
    startState: {
      doc: {
        lineAt(target: number) {
          let from = 0;
          for (const [index, line] of lines.entries()) {
            const to = from + line.length;
            if (target <= to || index === lines.length - 1) {
              return { from, number: index + 1, text: line, to };
            }
            from = to + 1;
          }
          return { from: 0, number: 1, text: lines[0] ?? '', to: lines[0]?.length ?? 0 };
        }
      }
    }
  };
}

function countFullSourceParses(parseSpy: ReturnType<typeof vi.spyOn>) {
  return parseSpy.mock.calls.filter(([source]: [unknown]) => source === COMPLEX_MARKDOWN).length;
}
