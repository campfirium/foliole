import { describe, expect, it, vi } from 'vitest';

import { getSelectionCommandPayload } from './contextCommands';

function createAdapter(content: string, selections: Array<{ from: number; to: number }>) {
  return {
    getContent: () => content,
    getSelection: () => selections[0] ?? { from: 0, to: 0 },
    getSelectionRanges: () => selections,
    replaceRange: () => undefined
  };
}

function expectSelectionPayloadMatches(
  content: string,
  selection: { from: number; to: number },
  expected: {
    clozeContent: string;
    selectionText: string;
  }
) {
  const payload = getSelectionCommandPayload('node-1', createAdapter(content, [selection]) as never);

  expect(payload).toMatchObject({
    clozeContent: expected.clozeContent,
    entries: [
      {
        clozeContent: expected.clozeContent,
        locator: {
          from: selection.from,
          originalText: expected.selectionText,
          to: selection.to
        },
        selectionText: expected.selectionText
      }
    ]
  });
}

describe('getSelectionCommandPayload', () => {
  it('preserves line breaks when building cloze content from selection', () => {
    const content = '# Title\n\nFirst line\nSecond line';
    const from = content.indexOf('First');
    const to = from + 'First line'.length;
    expectSelectionPayloadMatches(content, { from, to }, {
      clozeContent: '# Title\n\n[...]\nSecond line',
      selectionText: 'First line'
    });
  });

  it('builds one payload entry per selected range', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-1111-1111-111111111111')
      .mockReturnValueOnce('22222222-2222-2222-2222-222222222222');
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
      expect.objectContaining({ anchorId: 'anchor-11111111-1111-1111-1111-111111111111', selectionText: 'Alpha' }),
      expect.objectContaining({ anchorId: 'anchor-22222222-2222-2222-2222-222222222222', selectionText: 'Gamma' })
    ]);
    expect(payload?.selectionText).toBe('Alpha\nGamma');
    expect(payload?.clozeContent).toBe('[...] Beta [...] Delta');
  });

  it('strips opaque anchor tags when building selection payload text', () => {
    const content = 'Before <highlight id="anchor-1">Alpha</highlight id="anchor-1"> After';
    const from = content.indexOf('<highlight');
    const to = content.indexOf(' After');
    expectSelectionPayloadMatches(content, { from, to }, {
      clozeContent: 'Before [...] After',
      selectionText: 'Alpha'
    });
  });
});
