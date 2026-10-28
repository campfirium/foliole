import { afterEach, expect, it, vi } from 'vitest';

import { findTextAnchorAtPosition } from './textAnchorTarget';

afterEach(() => vi.restoreAllMocks());

function source(content = 'Alpha Beta Gamma') {
  return { id: 'source', content, parentNodeId: null };
}

function anchor(id: string, locator: unknown = { from: 6, to: 10, originalText: 'Beta' }) {
  return { id, content: 'Note', parentNodeId: 'source', anchorLink: { kind: 'highlight', locator } };
}

it('resolves the current parent text without replacing the node graph', () => {
  const nodes = { source: source(), note: anchor('note') };
  expect(findTextAnchorAtPosition('source', nodes, 15, [], 'Inserted Alpha Beta Gamma'))
    .toMatchObject({ nodeId: 'note', locator: { from: 15, to: 19, originalText: 'Beta' } });
  expect(nodes.source.content).toBe('Alpha Beta Gamma');
});

it.each([100, 1000, 10000])('does not materialize %i unrelated nodes for a point lookup', (count) => {
  const unrelated = source('Unrelated');
  const nodes = { ...Object.fromEntries(Array.from({ length: count }, (_, i) => [`other-${i}`, unrelated])),
    source: source(), note: anchor('note') };
  const values = Object.values;
  let materialized = 0;
  vi.spyOn(Object, 'values').mockImplementation((record) => {
    const result = values(record);
    if (result.includes(unrelated)) materialized += result.length;
    return result;
  });
  expect(findTextAnchorAtPosition('source', nodes, 7, []))
    .toMatchObject({ nodeId: 'note', originalText: 'Beta' });
  expect(materialized).toBe(0);
});

it('keeps direct ownership, trash filtering and left-closed right-open bounds', () => {
  const nodes = { source: source(), note: anchor('note'), nested: { ...anchor('nested'), parentNodeId: 'note' } };
  expect(findTextAnchorAtPosition('source', nodes, 6, [])?.nodeId).toBe('note');
  expect(findTextAnchorAtPosition('source', nodes, 10, [])).toBeNull();
  expect(findTextAnchorAtPosition('source', nodes, 5, [])).toBeNull();
  expect(findTextAnchorAtPosition('source', nodes, 7, ['note'])).toBeNull();
});

it('rejects overlapping nodes and overlapping ranges within one cloze', () => {
  const range = { from: 6, to: 10, originalText: 'Beta' };
  const cloze = { ...anchor('cloze', { ranges: [range, range] }), anchorLink: { kind: 'cloze', locator: { ranges: [range, range] } } };
  expect(findTextAnchorAtPosition('source', { source: source(), cloze }, 7, [])).toBeNull();
  expect(findTextAnchorAtPosition('source', { source: source(), a: anchor('a'), b: anchor('b') }, 7, [])).toBeNull();
});

it('preserves multi-range cloze identity without permitting range adjustment', () => {
  const cloze = { ...anchor('cloze'), anchorLink: { kind: 'cloze', locator: { ranges: [
    { from: 0, to: 5, originalText: 'Alpha' }, { from: 6, to: 10, originalText: 'Beta' }
  ] } } };
  expect(findTextAnchorAtPosition('source', { source: source(), cloze }, 7, []))
    .toEqual({ kind: 'cloze', nodeId: 'cloze', originalText: 'Beta', locator: { from: 6, to: 10, originalText: 'Beta' } });
});

it('retains locator-only matching when the parent body is unavailable', () => {
  expect(findTextAnchorAtPosition('source', { note: anchor('note') }, 7, [])?.nodeId).toBe('note');
  expect(findTextAnchorAtPosition('source', { source: source('Changed'), note: anchor('note') }, 7, [])).toBeNull();
});
