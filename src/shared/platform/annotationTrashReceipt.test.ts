import { expect, it } from 'vitest';

import { isRestoreNodesResult, isSoftDeleteNodesResult } from './workspaceRuntimeMutationResults';

const hash = '0'.repeat(64);
const receipt = { nodes: [{ nodeId: 'child', parentNodeId: 'parent', kind: 'item', contentHash: hash,
  revealHash: null, anchorHash: hash, imageRegionsHash: hash }], deletedAt: null };

it('accepts complete annotation receipts and the ordinary Trash results', () => {
  expect(isSoftDeleteNodesResult({ deletedNodeIds: ['child'], annotationHistory: receipt })).toBe(true);
  expect(isRestoreNodesResult({ restoredNodeIds: ['child'], skippedConflicts: [], annotationHistory: receipt })).toBe(true);
  expect(isSoftDeleteNodesResult({ deletedNodeIds: ['child'] })).toBe(true);
  expect(isRestoreNodesResult({ restoredNodeIds: ['child'], skippedConflicts: [] })).toBe(true);
});

it.each([null, {}, { ...receipt, nodes: [] }, { ...receipt, nodes: [receipt.nodes[0], receipt.nodes[0]] },
  { ...receipt, nodes: [{ ...receipt.nodes[0], contentHash: 'bad' }] }, { ...receipt, deletedAt: 42 }])(
  'rejects a malformed receipt before publishing annotation facts: %j', annotationHistory => {
    expect(isSoftDeleteNodesResult({ deletedNodeIds: ['child'], annotationHistory })).toBe(false);
    expect(isRestoreNodesResult({ restoredNodeIds: ['child'], skippedConflicts: [], annotationHistory })).toBe(false);
  }
);
