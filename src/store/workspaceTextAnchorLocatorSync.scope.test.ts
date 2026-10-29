import { describe, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { prepareWorkspaceNodeChildrenIndex } from '../features/nodes/model/workspaceNodeChildrenIndex';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';

import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

function child(id: string, parentNodeId = 'parent'): Node {
  return {
    id, parentNodeId, kind: 'topic', title: 'Beta', content: 'Beta',
    hasContent: true, hasReveal: false, reveal: null, review: null,
    createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z',
    anchorLink: { id: `anchor-${id}`, kind: 'highlight',
      locator: { from: 6, to: 10, originalText: 'Beta' } }
  };
}

function sync(nodesById: Record<string, Node>, excludedNodeIds?: ReadonlySet<string>) {
  return syncTextAnchorLocatorsForParentContent({
    nodesById, parentNodeId: 'parent', previousContent: 'Alpha Beta Gamma',
    nextContent: 'New Alpha Beta Gamma', timestamp: '2026-10-29T01:00:00.000Z',
    ...(excludedNodeIds ? { excludedNodeIds } : {})
  });
}

function fixture(size: number) {
  let reads = 0;
  const nodes: Record<string, Node> = { excerpt: child('excerpt') };
  for (let index = 0; index < size; index += 1) {
    nodes[`unrelated-${index}`] = {
      ...child(`unrelated-${index}`, 'other'),
      get parentNodeId() { reads += 1; return 'other'; }
    };
  }
  return { nodes, reads: () => reads, reset: () => { reads = 0; } };
}

describe('text anchor direct child read scope', () => {
  it.each([100, 1000])('does not revisit %i unrelated parents after preparation', (size) => {
    const sample = fixture(size);
    prepareWorkspaceNodeChildrenIndex(sample.nodes);
    sample.reset();
    const result = sync(sample.nodes);
    expect(result.updatedNodes.map(node => node.id)).toEqual(['excerpt']);
    expect(result.updatedNodes[0]?.anchorLink?.locator).toEqual({ from: 10, to: 14, originalText: 'Beta' });
    expect(result.nextNodesById['unrelated-0']).toBe(sample.nodes['unrelated-0']);
    expect(sample.reads()).toBe(0);
  });

  it('keeps source order, key aliases, exclusions and direct membership on a cold map', () => {
    const nodes = {
      '2': child('second'), alias: child('aliased'), excluded: child('excluded'),
      grandchild: child('grandchild', 'second'), plain: { ...child('plain'), anchorLink: null }
    };
    const result = sync(nodes, new Set(['excluded']));
    expect(result.updatedNodes.map(node => node.id)).toEqual(['second', 'aliased']);
    expect(result.nextNodesById.alias).toBe(nodes.alias);
    expect(result.nextNodesById.aliased?.anchorLink?.locator).toEqual({ from: 10, to: 14, originalText: 'Beta' });
    expect(result.nextNodesById.excluded).toBe(nodes.excluded);
    expect(result.nextNodesById.grandchild).toBe(nodes.grandchild);
  });

  it('follows a changed parent without touching unrelated parents or changing the old view', () => {
    const sample = fixture(100);
    prepareWorkspaceNodeChildrenIndex(sample.nodes);
    const next = patchWorkspaceRecord(sample.nodes, { excerpt: child('excerpt', 'other'), added: child('added') });
    sample.reset();
    expect(sync(next).updatedNodes.map(node => node.id)).toEqual(['added']);
    expect(sync(sample.nodes).updatedNodes.map(node => node.id)).toEqual(['excerpt']);
    expect(sample.reads()).toBe(0);
  });
});
