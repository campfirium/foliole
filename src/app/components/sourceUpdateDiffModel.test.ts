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

  it('marks a rewritten paragraph as one changed line', () => {
    const shared = '我知道长任务消耗很大，但没想到会这么大。特别是大量调用工具的长任务，token 消耗速度相当惊人。';
    const current = `${shared}后面左边不同。`;
    const updated = `${shared}后面右边不同。`;
    const model = buildSourceUpdateDiffModel(current, updated);

    expect(model.current.decorations.lineDecorations).toEqual([{ kind: 'removed', lineNumber: 1 }]);
    expect(model.updated.decorations.lineDecorations).toEqual([{ kind: 'added', lineNumber: 1 }]);
  });

  it('keeps an identical standalone paragraph unmarked between changed paragraphs', () => {
    const shared = '我知道长任务消耗很大，但没想到会这么大。特别是大量调用工具的长任务，token 消耗速度相当惊人。';
    const current = ['前面左边不同', '', shared, '', '后面左边不同'].join('\n');
    const updated = ['前面右边不同', '', shared, '', '后面右边不同'].join('\n');
    const model = buildSourceUpdateDiffModel(current, updated);

    expect(model.current.decorations.lineDecorations).toEqual([
      { kind: 'removed', lineNumber: 1 },
      { kind: 'removed', lineNumber: 5 }
    ]);
    expect(model.updated.decorations.lineDecorations).toEqual([
      { kind: 'added', lineNumber: 1 },
      { kind: 'added', lineNumber: 5 }
    ]);
    expect(model.current.decorations.spacerDecorations).toEqual([]);
    expect(model.updated.decorations.spacerDecorations).toEqual([]);
  });
});

describe('buildSourceUpdateDiffModel spacer alignment', () => {
  it('inserts spacer rows only when one side has unmatched extra lines', () => {
    const model = buildSourceUpdateDiffModel('title\nsame\nleft only\nend', 'title\nsame\nend');

    expect(model.current.decorations.lineDecorations).toEqual([{ kind: 'removed', lineNumber: 3 }]);
    expect(model.updated.decorations.lineDecorations).toEqual([]);
    expect(model.current.decorations.spacerDecorations).toEqual([]);
    expect(model.updated.decorations.spacerDecorations).toEqual([
      { beforeLineNumber: 3, kind: 'removed', lines: [{ className: 'cm-line-paragraph', lineNumber: 3, text: 'left only' }] }
    ]);
  });

  it('keeps repeated identical lines aligned in order', () => {
    const model = buildSourceUpdateDiffModel('alpha\nrepeat\nbeta\nrepeat\nomega', 'alpha\nrepeat\nrepeat\nomega');

    expect(model.current.decorations.lineDecorations).toEqual([{ kind: 'removed', lineNumber: 3 }]);
    expect(model.updated.decorations.lineDecorations).toEqual([]);
    expect(model.current.decorations.spacerDecorations).toEqual([]);
    expect(model.updated.decorations.spacerDecorations).toEqual([
      { beforeLineNumber: 3, kind: 'removed', lines: [{ className: 'cm-line-paragraph', lineNumber: 3, text: 'beta' }] }
    ]);
  });

  it('marks every changed line and balances unequal official diff chunks', () => {
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
    expect(model.current.decorations.spacerDecorations).toHaveLength(1);
    expect(model.current.decorations.spacerDecorations[0]?.kind).toBe('added');
    expect(model.current.decorations.spacerDecorations[0]?.lines).toHaveLength(2);
    expect(model.updated.decorations.spacerDecorations).toEqual([]);
  });
});
