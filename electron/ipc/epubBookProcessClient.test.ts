// @vitest-environment node
import { expect, it } from 'vitest';

import { classifyEpubParseFailure } from './epubBookProcessClient.js';

const base = { exit_code: 1, received_result: false, signal: null, stderr_tail: '' };

it('tells memory exhaustion, signals, crashes and silent exits apart', () => {
  expect(classifyEpubParseFailure({ ...base, exit_code: 134,
    stderr_tail: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory' })).toBe('out_of_memory');
  expect(classifyEpubParseFailure({ ...base, exit_code: null, signal: 'SIGKILL' })).toBe('killed_by_signal');
  expect(classifyEpubParseFailure(base)).toBe('crashed');
  expect(classifyEpubParseFailure({ ...base, received_result: true })).toBe('exited_after_result');
  expect(classifyEpubParseFailure({ ...base, exit_code: 0 })).toBe('exited_without_result');
});
