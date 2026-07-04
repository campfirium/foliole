import { expect, it } from 'vitest';

import { isReadActionAdvanceReadyFromMetrics } from './readActionAdvanceState';

it('treats bottom content padding as reader cushion instead of unread content', () => {
  expect(isReadActionAdvanceReadyFromMetrics({
    clientHeight: 500,
    contentPaddingBottom: 700,
    scrollHeight: 2000,
    scrollTop: 700
  })).toBe(true);
});

it('keeps read in its normal state while real content is still far below the viewport', () => {
  expect(isReadActionAdvanceReadyFromMetrics({
    clientHeight: 500,
    contentPaddingBottom: 700,
    scrollHeight: 2600,
    scrollTop: 700
  })).toBe(false);
});
