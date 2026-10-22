import { expect, it } from 'vitest';

import { NodeVersionGraph } from './nodeVersionGraph.js';

it('finds branch heads and ancestors through a shared merge base', () => {
  const graph = new NodeVersionGraph([
    ['base', []], ['left', ['base']], ['right', ['base']], ['merge', ['left', 'right']]
  ]);
  graph.assertAcyclic();
  expect(graph.heads(['base', 'left', 'right'])).toEqual(['left', 'right']);
  expect(graph.heads(['left', 'right', 'merge'])).toEqual(['merge']);
  expect([...graph.ancestors('merge')].sort()).toEqual(['base', 'left', 'right']);
  expect(graph.hasAncestor('right', 'left')).toBe(false);
  expect(graph.hasAncestor('merge', 'base')).toBe(true);
  expect(graph.hasAncestor('base', 'base')).toBe(false);
});

it('accepts reclaimed parents as gaps but rejects cycles and duplicate identities', () => {
  expect(() => new NodeVersionGraph([['head', ['reclaimed']], ['next', ['head']]]).assertAcyclic()).not.toThrow();
  expect(() => new NodeVersionGraph([['a', ['b', 'reclaimed']], ['b', ['a']]]).assertAcyclic())
    .toThrow('node_version_graph_cycle');
  expect(() => new NodeVersionGraph([['a', ['b']], ['b', ['a']]]).assertAcyclic())
    .toThrow('node_version_graph_cycle');
  expect(() => new NodeVersionGraph([['a', []], ['a', []]]))
    .toThrow('node_version_duplicate_identity:a');
});

it('handles long histories without recursive traversal or retained ancestor arrays', () => {
  const graph = new NodeVersionGraph(Array.from({ length: 20_000 }, (_, index) =>
    [String(index), index ? [String(index - 1)] : []] as const));
  graph.assertAcyclic();
  expect(graph.hasAncestor('19999', '0')).toBe(true);
  expect(graph.heads(['0', '9999', '19999'])).toEqual(['19999']);
  expect([...graph.parents.values()].reduce((sum, parents) => sum + parents.length, 0)).toBe(19_999);
});
