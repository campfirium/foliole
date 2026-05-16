import { expect, it } from 'vitest';

import {
  resolveInitialReadwiseBookHighlightState,
  resolvePlacedReadwiseBookHighlightState,
  resolveReadwiseBookBodyState
} from './readwiseBookState.js';

it('derives readwise book body state from import status', () => {
  expect(resolveReadwiseBookBodyState('pending')).toBe('unloaded');
  expect(resolveReadwiseBookBodyState('completed')).toBe('loaded');
});

it('keeps books without highlights out of failed placement state', () => {
  expect(resolveInitialReadwiseBookHighlightState({ annotationStatus: 'no_highlights' })).toBeNull();
  expect(resolvePlacedReadwiseBookHighlightState({ matchedCount: 0, unmatchedCount: 0 })).toBeNull();
});

it('summarizes placed readwise book highlights', () => {
  expect(resolveInitialReadwiseBookHighlightState({ annotationStatus: 'has_highlights' })).toBe('pending');
  expect(resolvePlacedReadwiseBookHighlightState({ matchedCount: 2, unmatchedCount: 0 })).toBe('placed');
  expect(resolvePlacedReadwiseBookHighlightState({ matchedCount: 1, unmatchedCount: 1 })).toBe('partial');
  expect(resolvePlacedReadwiseBookHighlightState({ matchedCount: 0, unmatchedCount: 2 })).toBe('failed');
});
