import { expect, it } from 'vitest';

import { parseRestoreNodesArgs, parseSoftDeleteNodesArgs } from './nodeCommandArgs.js';

const parent = { nodeId: 'parent', imageRegions: null, updatedAt: '2026-09-21T00:00:00.000Z' };

it.each([parseRestoreNodesArgs, parseSoftDeleteNodesArgs])('parses atomic parent updates with existing Trash commands', (parse) => {
  const args = { nodeIds: ['child'], deletedAt: parent.updatedAt, parentUpdates: [parent] };
  expect(parse(args).parentUpdates).toEqual([parent]);
  expect(parse({ nodeIds: ['child'], deletedAt: parent.updatedAt }).parentUpdates).toBeUndefined();
});

it.each([null, {}, [null], [{}], [{ ...parent, imageRegions: 'bad' }], [{ ...parent, updatedAt: '' }]])(
  'rejects malformed parent updates before performing any mutation: %j', (parentUpdates) => {
    expect(() => parseSoftDeleteNodesArgs({ nodeIds: ['child'], deletedAt: parent.updatedAt, parentUpdates })).toThrow();
    expect(() => parseRestoreNodesArgs({ nodeIds: ['child'], parentUpdates })).toThrow();
  }
);
