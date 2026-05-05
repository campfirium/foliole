import { type Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { buildSourceModeAnchorDecorationPlan } from '../model/anchorDecorationPlans';

import { addMark } from './liveMarkdownPrimitives';

function collectDecorationRanges(content: string) {
  const ranges: Range<Decoration>[] = [];
  const plan = buildSourceModeAnchorDecorationPlan(content);
  for (const range of plan.markRanges) {
    addMark(ranges, range.from, range.to, range.className);
  }
  const decorations = Decoration.set(ranges, true);
  const result: Array<{ className: string; from: number; to: number }> = [];

  decorations.between(0, content.length, (from, to, decoration) => {
    result.push({ className: decoration.spec.class ?? '', from, to });
  });

  return result;
}

describe('live markdown source anchor decorations', () => {
  it('styles parsed anchor tokens without rescanning the raw tag syntax', () => {
    const content = '<highlight   id="anchor-1">body</highlight id="anchor-1">';
    const ranges = collectDecorationRanges(content);

    expect(ranges).toEqual(expect.arrayContaining([
      { className: 'cm-md-anchor-tag-token', from: 0, to: content.indexOf('body') },
      { className: 'cm-md-anchor-tag-kind', from: 1, to: 10 },
      { className: 'cm-md-anchor-tag-id', from: 17, to: 25 },
      { className: 'cm-md-anchor-tag-token', from: content.indexOf('</highlight'), to: content.length },
      { className: 'cm-md-anchor-tag-delimiter', from: content.indexOf('</highlight') + 1, to: content.indexOf('</highlight') + 2 }
    ]));
  });
});
