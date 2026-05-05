import { describe, expect, it, vi } from 'vitest';

import {
  getSelectionCommandPayload,
  getSelectionCommandPayloadForContentRanges
} from './contextCommands';

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
    locator?: {
      from: number;
      originalText: string;
      to: number;
    };
    selectionText: string;
  }
) {
  const payload = getSelectionCommandPayload('node-1', createAdapter(content, [selection]) as never);

  expect(payload).toMatchObject({
    clozeContent: expected.clozeContent,
    entries: [
      {
        clozeContent: expected.clozeContent,
        locator: expected.locator ?? {
          from: selection.from,
          originalText: expected.selectionText,
          to: selection.from + expected.selectionText.length
        },
        selectionText: expected.selectionText
      }
    ]
  });
}

function runMergesOverlappingRangesCase() {
  const content = 'Alpha Beta Gamma';
  const alphaFrom = content.indexOf('Alpha');
  const payload = getSelectionCommandPayloadForContentRanges('node-1', content, [
    { from: alphaFrom, to: alphaFrom + 'Alpha Beta'.length },
    { from: content.indexOf('Beta'), to: content.indexOf('Gamma') }
  ]);

  expect(payload?.entries).toEqual([
      expect.objectContaining({
        locator: {
          from: alphaFrom,
          originalText: 'Alpha Beta',
          to: alphaFrom + 'Alpha Beta'.length
        },
        selectionText: 'Alpha Beta'
      })
  ]);
  expect(payload?.clozeContent).toBe('[...]Gamma');
  expect(payload?.selectionText).toBe('Alpha Beta');
}

function runMergesTouchingRangesCase() {
  const content = 'Alpha Beta Gamma';
  const payload = getSelectionCommandPayloadForContentRanges('node-1', content, [
    { from: 0, to: 5 },
    { from: 5, to: 10 }
  ]);

  expect(payload?.entries).toEqual([
    expect.objectContaining({
      locator: {
        from: 0,
        originalText: 'Alpha Beta',
        to: 10
      },
      selectionText: 'Alpha Beta'
    })
  ]);
  expect(payload?.clozeContent).toBe('[...] Gamma');
}

function runBuildsOnePayloadEntryPerSelectedRangeCase() {
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

  it('builds one payload entry per selected range', runBuildsOnePayloadEntryPerSelectedRangeCase);

  it('merges overlapping ranges before building payload entries', runMergesOverlappingRangesCase);

  it('merges touching ranges into one continuous payload entry', runMergesTouchingRangesCase);

  it('collects selected attachment images as full-image regions', () => {
    const content = 'Before\n\n![Cover](asset://hash-1.png)\n\nAfter';
    const from = content.indexOf('![Cover]');
    const to = from + '![Cover](asset://hash-1.png)'.length;

    const payload = getSelectionCommandPayloadForContentRanges('node-1', content, [{ from, to }]);

    expect(payload?.imageRegions).toEqual([
      {
        attachmentId: 'hash-1',
        regions: [{ height: 1, id: expect.stringContaining('-image-0'), width: 1, x: 0, y: 0 }]
      }
    ]);
  });
});
