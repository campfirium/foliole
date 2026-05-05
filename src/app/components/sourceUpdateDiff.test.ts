import { describe, expect, it } from 'vitest';

import { buildSourceUpdateDiff } from './sourceUpdateDiff';

describe('buildSourceUpdateDiff', () => {
  it('marks inserted and replaced line ranges in updated content', () => {
    const result = buildSourceUpdateDiff(
      ['alpha', 'beta', 'delta', 'omega'].join('\n'),
      ['alpha', 'beta', 'gamma', 'delta', 'omega changed'].join('\n')
    );

    expect(result.changeCount).toBe(2);
    expect(result.summary).toEqual([
      {
        addedLineCount: 1,
        removedLineCount: 0,
        startLine: 3,
        endLine: 3
      },
      {
        addedLineCount: 1,
        removedLineCount: 1,
        startLine: 5,
        endLine: 5
      }
    ]);
    expect(result.lines.filter((line) => line.isChanged)).toEqual([
      { isChanged: true, lineNumber: 3, text: 'gamma' },
      { isChanged: true, lineNumber: 5, text: 'omega changed' }
    ]);
  });

  it('keeps removal-only changes anchored near the next updated line', () => {
    const result = buildSourceUpdateDiff(
      ['title', 'remove me', 'body'].join('\n'),
      ['title', 'body'].join('\n')
    );

    expect(result.summary).toEqual([
      {
        addedLineCount: 0,
        removedLineCount: 1,
        startLine: 2,
        endLine: 2
      }
    ]);
    expect(result.lines).toEqual([
      { isChanged: false, lineNumber: 1, text: 'title' },
      { isChanged: false, lineNumber: 2, text: 'body' }
    ]);
  });
});
