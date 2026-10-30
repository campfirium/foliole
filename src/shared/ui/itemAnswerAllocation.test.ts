import { describe, expect, it } from 'vitest';

import { allocateItemAnswerHeight } from './itemAnswerAllocation';

describe('item answer allocation', () => {
  it('supports a quieter mobile review balance without changing the desktop default', () => {
    expect(allocateItemAnswerHeight(1000, 100, 100, 0.55)).toEqual([550, 450]);
    expect(allocateItemAnswerHeight(1000, 100, 700, 0.55)).toEqual([300, 700]);
    expect(allocateItemAnswerHeight(1000, 100, 100)).toEqual([618, 382]);
  });
  it.each([[0, 0], [100, 100]])('keeps short fields at the default reading balance (%s, %s)', (question, answer) => {
    expect(allocateItemAnswerHeight(1000, question, answer)).toEqual([618, 382]);
  });
  it('lends unused question space to a long answer', () => {
    expect(allocateItemAnswerHeight(1000, 100, 700)).toEqual([300, 700]);
    expect(allocateItemAnswerHeight(1000, 100, 2000)).toEqual([100, 900]);
  });
  it('lends unused answer space to a long question', () => {
    expect(allocateItemAnswerHeight(1000, 800, 100)).toEqual([800, 200]);
    expect(allocateItemAnswerHeight(1000, 2000, 100)).toEqual([900, 100]);
  });
  it('keeps both overflowing fields scrollable at the default balance', () => {
    expect(allocateItemAnswerHeight(1000, 2000, 2000)).toEqual([618, 382]);
  });
  it('uses the actual available height and handles a collapsed viewport', () => {
    expect(allocateItemAnswerHeight(500, 20, 20)).toEqual([309, 191]);
    expect(allocateItemAnswerHeight(0, 20, 20)).toEqual([0, 0]);
  });
});
