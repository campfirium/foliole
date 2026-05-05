import { describe, expect, it, vi } from 'vitest';

import { applySelectionMarkup, getSelectionCommandPayload } from './contextCommands';

function createAdapter(content: string, selections: Array<{ from: number; to: number }>) {
  return {
    getContent: () => content,
    getSelection: () => selections[0] ?? { from: 0, to: 0 },
    getSelectionRanges: () => selections,
    replaceRange: () => undefined
  };
}

describe('contextCommands', () => {
  it('preserves line breaks when building cloze content from selection', () => {
    const content = '# Title\n\nFirst line\nSecond line';
    const from = content.indexOf('First');
    const to = from + 'First line'.length;
    const payload = getSelectionCommandPayload('node-1', createAdapter(content, [{ from, to }]) as never);

    expect(payload).toMatchObject({
      clozeContent: '# Title\n\n[...]\nSecond line',
      entries: [
        {
          clozeContent: '# Title\n\n[...]\nSecond line',
          selectionText: 'First line'
        }
      ]
    });
  });

  it('builds one payload entry per selected range', () => {
    const content = 'Alpha Beta Gamma Delta';
    const alphaFrom = content.indexOf('Alpha');
    const betaFrom = content.indexOf('Gamma');
    const payload = getSelectionCommandPayload(
      'node-1',
      createAdapter(content, [
        { from: alphaFrom, to: alphaFrom + 'Alpha'.length },
        { from: betaFrom, to: betaFrom + 'Gamma'.length }
      ]) as never
    );

    expect(payload?.entries).toEqual([
      expect.objectContaining({ anchorId: '1', selectionText: 'Alpha' }),
      expect.objectContaining({ anchorId: '2', selectionText: 'Gamma' })
    ]);
    expect(payload?.selectionText).toBe('Alpha\nGamma');
    expect(payload?.clozeContent).toBe('[...] Beta [...] Delta');
  });

  it('applies markup to every selected range from the end of the document', () => {
    const content = 'Alpha Beta Gamma';
    const replaceRange = vi.fn();
    const adapter = {
      getContent: () => content,
      replaceRange
    };

    const applied = applySelectionMarkup(adapter as never, 'cloze', [
      { anchorId: '1', clozeContent: '', range: { from: 0, to: 5 }, selectionText: 'Alpha' },
      { anchorId: '2', clozeContent: '', range: { from: 11, to: 16 }, selectionText: 'Gamma' }
    ]);

    expect(applied).toBe(true);
    expect(replaceRange).toHaveBeenNthCalledWith(1, 11, 16, '<cloze id="2">Gamma</cloze id="2">');
    expect(replaceRange).toHaveBeenNthCalledWith(2, 0, 5, '<cloze id="1">Alpha</cloze id="1">');
  });
});
