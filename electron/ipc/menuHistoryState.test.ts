import { expect, it } from 'vitest';

import { parseMenuHistoryState } from './menuHistoryState.js';

it('accepts current history state and ordinary callers without it', () => {
  expect(parseMenuHistoryState(undefined)).toBeUndefined();
  expect(parseMenuHistoryState({ undoTitle: 'Undo Edit Text', redoTitle: 'Redo', nativeEditing: false })).toEqual({
    undoTitle: 'Undo Edit Text', redoTitle: 'Redo', nativeEditing: false
  });
});
it.each([null, {}, { undoTitle: 'Undo', redoTitle: 'Redo', nativeEditing: 1 },
  { undoTitle: 'Undo', redoTitle: 'Redo', nativeEditing: false, extra: true }])('rejects malformed menu history %j', value => {
  expect(() => parseMenuHistoryState(value)).toThrow();
});
