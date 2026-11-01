import { expect, it } from 'vitest';

import { parseRestoreNodesArgs, parseSoftDeleteNodesArgs } from './nodeCommandArgs.js';

const hash = '0'.repeat(64);
const fact = { nodeId: 'child', parentNodeId: 'parent', kind: 'item', contentHash: hash,
  revealHash: null, anchorHash: hash, imageRegionsHash: hash };
const replay = { mode: 'replay', nodes: [fact], expectedDeletedAt: null,
  parents: [{ nodeId: 'parent', imageRegionsHash: hash }] };
const args = { nodeIds: ['child'], deletedAt: '2026-11-01T00:00:00.000Z' };

it('preserves protected replay facts through both existing Trash parsers', () => {
  expect(parseSoftDeleteNodesArgs({ ...args, annotationHistory: replay }).annotationHistory).toEqual(replay);
  const restore = { ...replay, expectedDeletedAt: args.deletedAt };
  expect(parseRestoreNodesArgs({ ...args, annotationHistory: restore }).annotationHistory).toEqual(restore);
});

it('captures facts only for an initial live annotation deletion', () => {
  const capture = { mode: 'capture', expectedDeletedAt: null, parents: [] };
  expect(parseSoftDeleteNodesArgs({ ...args, annotationHistory: capture }).annotationHistory).toEqual(capture);
  expect(() => parseRestoreNodesArgs({ ...args, annotationHistory: capture })).toThrow();
  expect(() => parseSoftDeleteNodesArgs({ ...args, annotationHistory: { ...capture, expectedDeletedAt: args.deletedAt } })).toThrow();
});

it.each([null, {}, { ...replay, mode: 'unknown' }, { ...replay, nodes: [] },
  { ...replay, nodes: [fact, fact] }, { ...replay, nodes: [{ ...fact, contentHash: 'bad' }] },
  { ...replay, expectedDeletedAt: 'bad' }, { ...replay, parents: [replay.parents[0], replay.parents[0]] },
  { ...replay, nodes: [{ ...fact, nodeId: '' }] }])('rejects malformed guard facts before storage: %j', annotationHistory => {
  expect(() => parseSoftDeleteNodesArgs({ ...args, annotationHistory })).toThrow();
  expect(() => parseRestoreNodesArgs({ ...args, annotationHistory })).toThrow();
});
