import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { addTopicCollection } from '../../../lib/core/nodes/topicCollectionsFrontmatter';
import { createCollectionVirtualNodeFilter, createManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { createVirtualNodeFilterFromKeyword } from '../../features/nodes/model/virtualNodeDetail';

import { useVirtualNodeResultIndex } from './useVirtualNodeResultIndex';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

function createInputs() {
  const nodesById: Record<string, Node> = {
    saved: {
      ...createWorkspaceContentNode({ id: 'saved', title: 'Search', kind: 'folder', specialKind: 'virtual' }),
      parentNodeId: VIRTUAL_ROOT_NODE_ID, virtualFilter: createVirtualNodeFilterFromKeyword('alpha')
    },
    first: createWorkspaceContentNode({ id: 'first', title: 'First', kind: 'topic', content: 'alpha' }),
    second: createWorkspaceContentNode({ id: 'second', title: 'Second', kind: 'topic', content: 'beta' })
  };
  return { nodesById, nodeOrder: ['saved', 'first', 'second'], trashedNodeIds: [] as string[] };
}

function expectResults(index: ReturnType<typeof useVirtualNodeResultIndex>, expected: string[], root = expected) {
  expect([...index.resultIdsByVirtualId]).toEqual([['saved', expected]]);
  expect([...index.countById]).toEqual([
    ...(expected.length ? [['saved', expected.length]] : []),
    ...(root.length ? [[VIRTUAL_ROOT_NODE_ID, root.length]] : [])
  ]);
  expect(index.rootResultIds).toEqual(root);
}

it.each([
  ['content', { content: 'beta' }],
  ['folder kind', { kind: 'folder' }],
  ['special kind', { specialKind: 'inbox' }],
  ['derived article', { anchorLink: { id: 'anchor', kind: 'highlight', sourceNodeId: 'second' } }]
] as [string, Partial<Node>][])('refreshes candidate eligibility and text for %s changes', (_name, patch) => {
  const inputs = createInputs();
  const { result, rerender } = renderHook(useVirtualNodeResultIndex, { initialProps: inputs });
  expectResults(result.current, ['first']);
  const updated = { ...inputs, nodesById: { ...inputs.nodesById, first: { ...inputs.nodesById.first!, ...patch } } };
  rerender(updated);
  expectResults(result.current, []);
  rerender(inputs);
  expectResults(result.current, ['first']);
});

it('refreshes titles, filters, source order, insertion and removal', () => {
  let inputs = createInputs();
  const { result, rerender } = renderHook(useVirtualNodeResultIndex, { initialProps: inputs });
  inputs = { ...inputs, nodesById: { ...inputs.nodesById, second: { ...inputs.nodesById.second!, title: 'Alpha second' } } };
  rerender(inputs);
  expectResults(result.current, ['first', 'second']);
  inputs = { ...inputs, nodeOrder: ['saved', 'second', 'first'] };
  rerender(inputs);
  expectResults(result.current, ['second', 'first']);
  inputs = { ...inputs, nodesById: { ...inputs.nodesById, saved: {
    ...inputs.nodesById.saved!, virtualFilter: createVirtualNodeFilterFromKeyword('beta')
  } } };
  rerender(inputs);
  expectResults(result.current, ['second']);
  inputs = { ...inputs, nodesById: { ...inputs.nodesById,
    third: createWorkspaceContentNode({ id: 'third', kind: 'topic', title: 'Third', content: 'beta' })
  }, nodeOrder: [...inputs.nodeOrder, 'third'] };
  rerender(inputs);
  expectResults(result.current, ['second', 'third']);
  const remaining = { ...inputs.nodesById };
  delete remaining.second;
  rerender({ ...inputs, nodesById: remaining });
  expectResults(result.current, ['third']);
});

it('keeps collection fallback and frontmatter precedence current', () => {
  let inputs = createInputs();
  inputs.nodesById.saved = { ...inputs.nodesById.saved!, virtualFilter: createCollectionVirtualNodeFilter('Reading') };
  inputs.nodesById.first = { ...inputs.nodesById.first!, content: '', collections: ['Reading'] };
  const { result, rerender } = renderHook(useVirtualNodeResultIndex, { initialProps: inputs });
  expectResults(result.current, ['first']);
  inputs = { ...inputs, nodesById: { ...inputs.nodesById, first: { ...inputs.nodesById.first!, collections: [] } } };
  rerender(inputs);
  expectResults(result.current, []);
  inputs = { ...inputs, nodesById: { ...inputs.nodesById, first: {
    ...inputs.nodesById.first!, content: addTopicCollection('body', 'Reading')
  } } };
  rerender(inputs);
  expectResults(result.current, ['first']);
});

it('refreshes manual membership, result order, root ownership and trash restoration', () => {
  let inputs = createInputs();
  inputs.nodesById.saved = {
    ...inputs.nodesById.saved!, virtualFilter: createManualVirtualNodeFilter(), manualChildOrder: ['second', 'first']
  };
  const { result, rerender } = renderHook(useVirtualNodeResultIndex, { initialProps: inputs });
  expectResults(result.current, ['second', 'first'], ['first', 'second']);
  inputs = { ...inputs, nodesById: { ...inputs.nodesById, saved: { ...inputs.nodesById.saved!, manualChildOrder: ['first'] } } };
  rerender(inputs);
  expectResults(result.current, ['first']);
  rerender({ ...inputs, trashedNodeIds: ['first'] });
  expectResults(result.current, ['first'], []);
  rerender({ ...inputs, trashedNodeIds: ['saved'] });
  expectResults(result.current, ['first'], []);
  rerender(inputs);
  expectResults(result.current, ['first']);
  inputs = { ...inputs, nodesById: { ...inputs.nodesById, saved: { ...inputs.nodesById.saved!, parentNodeId: 'folder' } } };
  rerender(inputs);
  expectResults(result.current, ['first'], []);
});
