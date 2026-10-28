import { expect, it } from 'vitest';

import { parseDeleteNodesPermanentlyArgs } from './nodeCommandArgs.js';

it('accepts deletion IDs without requesting unrelated workspace ordering', () => {
  expect(parseDeleteNodesPermanentlyArgs({ nodeIds: ['removed'] })).toEqual({ nodeIds: ['removed'] });
});

it.each([null, 'removed', [1]])('rejects malformed deletion IDs: %j', (nodeIds) => {
  expect(() => parseDeleteNodesPermanentlyArgs({ nodeIds })).toThrow('nodeIds');
});

it('rejects a global order instead of using it as a deletion side effect', () => {
  expect(() => parseDeleteNodesPermanentlyArgs({ nodeIds: ['removed'], nodeOrder: ['other'] })).toThrow('nodeOrder');
});
