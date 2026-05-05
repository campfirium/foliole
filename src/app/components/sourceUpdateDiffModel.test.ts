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

  it('keeps rendered headings paired while leaving inserted noise as gaps', () => {
    const model = buildSourceUpdateDiffModel(
      ['alpha', '### 📂 其他重要观点摘要 (Brief Summary)', 'omega'].join('\n'),
      ['alpha', '123', '123', '### 📂 其他重要观点摘要 (Brief Summary)123132', 'omega'].join('\n')
    );

    expect(model.current.decorations.lineDecorations).toEqual([{ kind: 'removed', lineNumber: 2 }]);
    expect(model.updated.decorations.lineDecorations).toEqual([
      { kind: 'added', lineNumber: 2 },
      { kind: 'added', lineNumber: 3 },
      { kind: 'added', lineNumber: 4 }
    ]);
    expect(model.current.decorations.spacerDecorations).toEqual([
      {
        beforeLineNumber: 2,
        kind: 'added',
        lines: [
          { className: null, lineNumber: 2, text: '123' },
          { className: null, lineNumber: 3, text: '123' }
        ]
      }
    ]);
    expect(model.updated.decorations.spacerDecorations).toEqual([]);
  });
});
