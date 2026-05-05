import { describe, expect, it } from 'vitest';

import { buildNodeBreadcrumbs } from './nodeBreadcrumbs';
import type { Node } from './nodeTypes';

function createNode(id: string, title: string, parentNodeId: string | null): Node {
  return {
    id,
    parentNodeId,
    title,
    content: title,
    reveal: null,
    review: null,
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z'
  };
}

describe('buildNodeBreadcrumbs', () => {
  it('builds full path when depth is short', () => {
    const nodesById: Record<string, Node> = {
      root: createNode('root', 'Root', null),
      child: createNode('child', 'Child', 'root')
    };

    const items = buildNodeBreadcrumbs('child', nodesById);

    expect(items.map((item) => item.title)).toEqual(['Root', 'Child']);
    expect(items.some((item) => item.isEllipsis)).toBe(false);
  });

  it('collapses middle items when path exceeds max length', () => {
    const nodesById: Record<string, Node> = {
      n1: createNode('n1', 'N1', null),
      n2: createNode('n2', 'N2', 'n1'),
      n3: createNode('n3', 'N3', 'n2'),
      n4: createNode('n4', 'N4', 'n3'),
      n5: createNode('n5', 'N5', 'n4')
    };

    const items = buildNodeBreadcrumbs('n5', nodesById, 3);

    expect(items.map((item) => item.title)).toEqual(['...', 'N4', 'N5']);
    expect(items[0]?.isEllipsis).toBe(true);
  });
});
