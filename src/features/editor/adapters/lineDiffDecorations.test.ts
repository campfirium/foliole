import { describe, expect, it } from 'vitest';

import { buildEditorDiffDecorations, buildLineClassProfiles } from './lineDiffDecorations';

describe('buildEditorDiffDecorations', () => {
  it('accepts mixed line and spacer entries without requiring pre-sorted input order', () => {
    const view = {
      state: {
        doc: {
          length: 12,
          lines: 3,
          line: (lineNumber: number) => [{ from: 0 }, { from: 6 }, { from: 10 }][lineNumber - 1] ?? { from: 12 }
        }
      }
    } as never;

    expect(() =>
      buildEditorDiffDecorations(view, {
        lineDecorations: [{ kind: 'removed', lineNumber: 3 }],
        spacerDecorations: [{ beforeLineNumber: 2, kind: 'added', lines: [{ className: null, lineNumber: 2, text: 'gap' }] }]
      })
    ).not.toThrow();
  });

  it('uses parser-backed markdown line classes for spacer profiles', () => {
    expect(buildLineClassProfiles(['# Title', '#tag/sample', '- [x] Done']).map((profile) => profile.className)).toEqual([
      'cm-line-h1',
      null,
      'cm-line-list-unordered cm-line-task-list'
    ]);
  });

  it('uses parser-backed code fence profiles for spacer lines', () => {
    expect(buildLineClassProfiles(['```ts', '# not heading', '- not list', '```']).map((profile) => profile.className)).toEqual([
      'cm-line-code-fence',
      'cm-line-code',
      'cm-line-code',
      'cm-line-code-fence'
    ]);
  });
});
