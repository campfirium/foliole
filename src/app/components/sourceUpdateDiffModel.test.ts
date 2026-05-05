import { describe, expect, it } from 'vitest';

import { buildSourceUpdateDiffModel } from './sourceUpdateDiffModel';

describe('buildSourceUpdateDiffModel', () => {
  it('pairs one-for-one changed lines without adding extra spacer rows', () => {
    const model = buildSourceUpdateDiffModel('title\nsame\nleft only\nend', 'title\nsame\nright only\nend');

    expect(model.current.decorations.lineDecorations).toEqual([{ kind: 'removed', lineNumber: 3 }]);
    expect(model.updated.decorations.lineDecorations).toEqual([{ kind: 'added', lineNumber: 3 }]);
    expect(model.current.decorations.spacerDecorations).toEqual([]);
    expect(model.updated.decorations.spacerDecorations).toEqual([]);
  });

  it('inserts spacer rows only when one side has unmatched extra lines', () => {
    const model = buildSourceUpdateDiffModel('title\nsame\nleft only\nend', 'title\nsame\nend');

    expect(model.current.decorations.lineDecorations).toEqual([{ kind: 'removed', lineNumber: 3 }]);
    expect(model.updated.decorations.lineDecorations).toEqual([]);
    expect(model.current.decorations.spacerDecorations).toEqual([]);
    expect(model.updated.decorations.spacerDecorations).toEqual([
      { beforeLineNumber: 3, kind: 'removed', lines: [{ className: null, lineNumber: 3, text: 'left only' }] }
    ]);
  });

  it('keeps repeated identical lines aligned in order', () => {
    const model = buildSourceUpdateDiffModel('alpha\nrepeat\nbeta\nrepeat\nomega', 'alpha\nrepeat\nrepeat\nomega');

    expect(model.current.decorations.lineDecorations).toEqual([{ kind: 'removed', lineNumber: 3 }]);
    expect(model.updated.decorations.lineDecorations).toEqual([]);
    expect(model.current.decorations.spacerDecorations).toEqual([]);
    expect(model.updated.decorations.spacerDecorations).toEqual([
      { beforeLineNumber: 3, kind: 'removed', lines: [{ className: null, lineNumber: 3, text: 'beta' }] }
    ]);
  });
});
