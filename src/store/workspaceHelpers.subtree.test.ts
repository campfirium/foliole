import { describe, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { collectNodeSubtreeIds } from './workspaceHelpers';

function node(id: string, parentNodeId: string | null): Node {
  return { id, parentNodeId } as Node;
}

describe('subtree collection from shared direct children', () => {
  it('reads unrelated parent relations once across repeated roots on one snapshot', () => {
    let unrelatedReads = 0;
    const nodes = { root: node('root', null), a: node('a', 'root'),
      deep: node('deep', 'a'), b: node('b', 'root') };
    for (let i = 0; i < 100; i++) {
      Object.assign(nodes, { [`other-${i}`]: { id: `other-${i}`,
        get parentNodeId() { unrelatedReads++; return null; } } });
    }
    expect(collectNodeSubtreeIds('root', nodes)).toEqual(['root', 'a', 'b', 'deep']);
    expect(collectNodeSubtreeIds('a', nodes)).toEqual(['a', 'deep']);
    expect(unrelatedReads).toBe(100);
  });

  it('preserves numeric key order, duplicate candidate ids, missing ids and tombstones', () => {
    const nodes = { root: node('root', null), '10': node('10', 'root'), '2': node('2', 'root'),
      alias: node('2', 'root'), absent: node('missing-key', 'root'),
      trash: { ...node('trash', 'root'), deletedAt: '2026-10-28' }, deep: node('deep', '2') };
    expect(collectNodeSubtreeIds('root', nodes)).toEqual(['root', '2', '10', '2', 'trash', 'deep', 'deep']);
    expect(collectNodeSubtreeIds('missing', nodes)).toEqual([]);
    expect(collectNodeSubtreeIds('', nodes)).toEqual([]);
  });
});
