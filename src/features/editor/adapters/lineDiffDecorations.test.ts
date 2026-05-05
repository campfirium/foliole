import { describe, expect, it } from 'vitest';

import { buildEditorDiffDecorations } from './lineDiffDecorations';

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
});
