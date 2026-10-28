import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { getWholeImageExcerptTarget, resolveWholeImageExistingExcerpt } from './existingExcerptTarget';

const image = '![Cover](asset://cover.png)';
const region = { id: 'region', x: 0, y: 0, width: 1, height: 1 };
function excerpt(id = 'excerpt', overrides: Partial<Node> = {}): Node {
  return {
    id, kind: 'topic', title: 'Cover', content: `${image}\n※ Current thought`, parentNodeId: 'parent',
    createdAt: '2026-10-28', updatedAt: '2026-10-28', review: null, reveal: null,
    anchorLink: { id: 'anchor', kind: 'highlight', locator: { from: 0, to: image.length, originalText: image } },
    imageRegions: [{ attachmentId: 'cover', regions: [region] }], ...overrides
  };
}
function target() {
  const element = document.createElement('div');
  element.dataset.regionId = region.id;
  return element;
}
function resolve(nodesById: Record<string, Node>, trashedNodeIds: string[] = [], element = target()) {
  return resolveWholeImageExistingExcerpt({ activeNodeId: 'parent', nodesById, trashedNodeIds, target: element });
}

it('returns the exact current body and editable annotation for one direct whole-image highlight', () => {
  expect(resolve({ excerpt: excerpt() })).toEqual({
    canAdjustRange: false, content: `${image}\n※ Current thought`, kind: 'highlight',
    nodeId: 'excerpt', note: 'Current thought', originalText: image
  });
  expect(resolve({ excerpt: excerpt('excerpt', { content: `${image}\n※ Revised thought` }) })?.note)
    .toBe('Revised thought');
});

it('keeps owner, tombstone, locator kind and region boundary checks', () => {
  const matching = excerpt();
  const others = [
    excerpt('other-parent', { parentNodeId: 'other' }),
    excerpt('grandchild', { parentNodeId: matching.id }),
    excerpt('cloze', { anchorLink: { ...matching.anchorLink!, kind: 'cloze' } }),
    excerpt('invalid', { anchorLink: { id: 'invalid', kind: 'highlight', locator: { page: 1, x: 0, y: 0, width: 1, height: 1 } } }),
    excerpt('partial', { imageRegions: [{ attachmentId: 'cover', regions: [{ ...region, width: 0.998 }] }] }),
    excerpt('offset', { imageRegions: [{ attachmentId: 'cover', regions: [{ ...region, x: 0.002 }] }] }),
    excerpt('other-region', { imageRegions: [{ attachmentId: 'cover', regions: [{ ...region, id: 'other' }] }] })
  ];
  const nodes = Object.fromEntries(others.map((node) => [node.id, node]));
  expect(resolve(nodes)).toBeNull();
  expect(resolve({ ...nodes, excerpt: matching })?.nodeId).toBe('excerpt');
  expect(resolve({ ...nodes, excerpt: matching }, [matching.id])).toBeNull();
  expect(resolve({ excerpt: matching }, [], document.createElement('div'))).toBeNull();
  expect(resolve({ excerpt: excerpt('excerpt', { imageRegions: [{ attachmentId: 'cover', regions: [
    { ...region, x: 0.001, y: 0.001, width: 0.999, height: 0.999 }
  ] }] }) })?.nodeId).toBe('excerpt');
});

it('rejects multiple candidates and reflects deletion, restoration and reparenting', () => {
  const first = excerpt('first');
  const second = excerpt('second');
  expect(resolve({ first, second })).toBeNull();
  expect(resolve({ first, second }, ['second'])?.nodeId).toBe('first');
  expect(resolve({ first, second })).toBeNull();
  expect(resolve({ first, second: { ...second, parentNodeId: 'other' } })?.nodeId).toBe('first');
  expect(resolve({ first: { ...first, parentNodeId: 'other' }, second })?.nodeId).toBe('second');
  expect(resolve(Object.create({ inherited: first }) as Record<string, Node>)).toBeNull();
});

it.each([100, 1000, 10000])('stops reading node records once ambiguity is established with %i unrelated nodes', (count) => {
  const nodes: Record<string, Node> = { first: excerpt('first'), second: excerpt('second') };
  for (let index = 0; index < count; index++) nodes[`other-${index}`] = excerpt(`other-${index}`, { parentNodeId: 'other' });
  let reads = 0;
  const observed = new Proxy(nodes, { get(object, key: string) { reads++; return object[key]; } });
  expect(resolve(observed)).toBeNull();
  expect(reads).toBe(2);
});

it('resolves a whole-image target from the surface only when the rendered region is unique', () => {
  const surface = document.createElement('div');
  surface.className = 'cm-md-image-surface';
  surface.dataset.mdImageHighlighted = 'true';
  const full = target();
  full.className = 'cm-md-image-cloze-region';
  full.dataset.regionScope = 'full-image';
  surface.append(full);
  expect(getWholeImageExcerptTarget(surface)).toBe(full);
  surface.append(full.cloneNode());
  expect(getWholeImageExcerptTarget(surface)).toBeNull();
  expect(getWholeImageExcerptTarget(full)).toBe(full);
});
