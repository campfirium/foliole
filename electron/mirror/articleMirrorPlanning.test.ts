// @vitest-environment node

import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { collectArticleMirrorPlans } from './articleMirrorPlanning.js';

type Node = WorkspaceSnapshot['nodesById'][string];
const timestamp = '2026-10-01T00:00:00Z';
const anchorLink: NonNullable<Node['anchorLink']> = {
  id: 'highlight', kind: 'highlight', locator: { from: 0, to: 4, originalText: 'Body' }
};

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id, kind: 'topic', title: id, parentNodeId: null, anchorLink: null,
    content: 'Body', reveal: null, reading: null, review: null,
    isTitleManual: true, hideTitleHeading: false, createdAt: timestamp, updatedAt: timestamp,
    ...overrides
  };
}

function snapshot(nodes: Node[], nodeOrder = nodes.map(({ id }) => id)): WorkspaceSnapshot {
  return {
    activeNodeId: null, nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
    nodeOrder, trashedNodeIds: [], untitledSequenceByParent: {}
  };
}

it.each([100, 1000, 3000])('bounds parent checks linearly for %i root articles', (size) => {
  let parentReads = 0;
  const nodes = Array.from({ length: size }, (_, index) => node(`article-${index}`));
  for (const item of nodes) {
    Object.defineProperty(item, 'parentNodeId', { get: () => { parentReads += 1; return null; } });
  }

  const plans = collectArticleMirrorPlans(snapshot(nodes), '/isolated/mirror');

  expect(plans.map(({ articleId }) => articleId)).toEqual(nodes.map(({ id }) => id));
  expect(plans.every((plan) => !plan.derivedNodeIds.length && !plan.manualTopicIds.length)).toBe(true);
  expect(new Set(plans.map(({ targetPath }) => targetPath)).size).toBe(size);
  // Count work rather than wall time so slow hosts cannot hide or cause a regression.
  expect(parentReads).toBeLessThanOrEqual(5 * size);
});

it('keeps a fixed article plan stable as unrelated article count grows without repeated node checks', () => {
  const target = node('target');
  const child = node('child', { parentNodeId: target.id, anchorLink, updatedAt: '2026-10-02T00:00:00Z' });
  const expected = collectArticleMirrorPlans(snapshot([target, child]), '/isolated/mirror')[0];
  let parentReads = 0;
  const nodes = [target, child, ...Array.from({ length: 1000 }, (_, index) => node(`unrelated-${index}`))];
  for (const item of nodes) {
    const parentId = item.parentNodeId;
    Object.defineProperty(item, 'parentNodeId', { get: () => { parentReads += 1; return parentId; } });
  }

  const plans = collectArticleMirrorPlans(snapshot(nodes), '/isolated/mirror');

  expect(plans.find(({ articleId }) => articleId === target.id)).toEqual(expected);
  expect(parentReads).toBeLessThanOrEqual(5 * nodes.length);
});

it('preserves direct derived membership, independent ordering, timestamps and fresh snapshot relationships', () => {
  const nodes = [
    node('article'), node('second'),
    node('derived-b', { parentNodeId: 'article', anchorLink, updatedAt: '2026-10-03T00:00:00Z' }),
    node('manual-b', { parentNodeId: 'article', updatedAt: '2026-10-04T00:00:00Z' }),
    node('derived-a', { parentNodeId: 'article', anchorLink }),
    node('manual-a', { parentNodeId: 'article' }),
    node('nested-derived', { parentNodeId: 'manual-a', anchorLink }),
    node('other-derived', { parentNodeId: 'second', anchorLink }),
    node('trashed', { updatedAt: '2026-10-09T00:00:00Z' })
  ];
  const input = snapshot(nodes, ['second', 'manual-a', 'article', 'derived-a', 'manual-b', 'derived-b']);
  input.trashedNodeIds = ['trashed'];
  const plans = collectArticleMirrorPlans(input, '/isolated/mirror');

  expect(plans.map(({ articleId }) => articleId)).toEqual(['second', 'manual-a', 'article', 'manual-b']);
  expect(plans[2]).toMatchObject({
    derivedNodeIds: ['derived-b', 'derived-a'], manualTopicIds: [],
    sourceUpdatedAt: '2026-10-03T00:00:00Z', relativePath: 'article.md'
  });
  expect(plans[1]?.derivedNodeIds).toEqual(['nested-derived']);
  expect(plans[0]?.derivedNodeIds).toEqual(['other-derived']);
  input.nodesById['derived-b']!.parentNodeId = 'second';
  const next = collectArticleMirrorPlans(input, '/isolated/mirror');
  expect(next[0]?.derivedNodeIds).toEqual(['derived-b', 'other-derived']);
  expect(next[2]?.derivedNodeIds).toEqual(['derived-a']);
});
