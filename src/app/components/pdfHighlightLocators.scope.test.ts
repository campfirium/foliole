import { expect, it } from 'vitest';

import { buildNodeTreeRows } from '../../features/nodes/model/nodeTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { collectPdfHighlightLocators } from './pdfHighlightLocators';

function node(id: string, parentNodeId: string | null): Node {
  return {
    id, parentNodeId, kind: 'topic', title: id, content: '', reveal: null,
    review: null, createdAt: '', updatedAt: '',
    anchorLink: { id, kind: 'highlight', locator: { page: 1, x: 0.1, y: 0.2 } }
  };
}

it.each([100, 1000])('does not read unrelated list fields across %i nodes', (size) => {
  let unrelatedFieldReads = 0;
  const nodes: Record<string, Node> = { pdf: node('pdf', null), child: node('child', 'pdf') };
  for (let index = 0; index < size; index += 1) {
    const unrelated = node(`other-${index}`, null);
    for (const field of ['content', 'reveal', 'review', 'reading', 'title']) {
      const value = unrelated[field as keyof Node];
      Object.defineProperty(unrelated, field, { get: () => { unrelatedFieldReads += 1; return value; } });
    }
    nodes[unrelated.id] = unrelated;
  }
  expect(collectPdfHighlightLocators('pdf', Object.keys(nodes), nodes).map(locator => locator.nodeId))
    .toEqual(['pdf', 'child']);
  expect(unrelatedFieldReads).toBe(0);
});

it('preserves depth-first order, membership, tombstones and first anchor identity', () => {
  const nodes = {
    pdf: node('pdf', 'missing'), a: node('a', 'pdf'), b: node('b', 'pdf'),
    nested: node('nested', 'a'), absent: node('absent', 'pdf'),
    duplicate: node('duplicate', 'pdf'), trash: node('trash', 'pdf'), other: node('other', null)
  };
  nodes.duplicate.anchorLink = nodes.a.anchorLink ?? null;
  const order = ['nested', 'other', 'b', 'pdf', 'a', 'duplicate', 'trash', 'missing'];
  expect(collectPdfHighlightLocators('pdf', order, nodes, ['trash']).map(locator => locator.nodeId))
    .toEqual(['pdf', 'b', 'a', 'nested']);
  expect(collectPdfHighlightLocators('absent', order, nodes)).toEqual([]);
});

it('matches existing tree subtree membership for ordered forests, duplicates and cycles', () => {
  const ids = ['a', 'b', 'c'];
  const parents = [null, 'missing', ...ids];
  for (const a of parents) for (const b of parents) for (const c of parents) {
    const nodes = { a: node('a', a), b: node('b', b), c: node('c', c) };
    for (const order of [ids, ['c', 'a', 'b'], ['b', 'a', 'b', 'c'], ['a', 'c']]) {
      const rows = buildNodeTreeRows(order, toWorkspaceListNodesById(nodes));
      for (const root of ids) {
        const start = rows.findIndex(row => row.node.id === root);
        const expected: string[] = [];
        if (start >= 0) {
          expected.push(root);
          for (let index = start + 1; index < rows.length && rows[index]!.depth > rows[start]!.depth; index += 1) {
            expected.push(rows[index]!.node.id);
          }
        }
        expect(collectPdfHighlightLocators(root, order, nodes).map(locator => locator.nodeId)).toEqual(expected);
      }
    }
  }
});
