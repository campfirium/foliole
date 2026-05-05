import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { baseNode, buildSectionProps, createSectionElement } from './DocumentPanelSection.testSupport';

it('switches from folder view back to document view without blanking the page', () => {
  const folderNodesById: Record<string, Node> = {
    'node-1': { ...baseNode, kind: 'folder', content: 'Folder prose should stay hidden' },
    'node-2': { ...baseNode, id: 'node-2', parentNodeId: 'node-1', title: 'Child topic', content: '# Child topic' }
  };
  const topicNodesById: Record<string, Node> = {
    'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' },
    'node-2': { ...baseNode, id: 'node-2', title: 'Sibling topic', content: '# Sibling topic' }
  };
  const props = buildSectionProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: folderNodesById
  });
  const view = render(
    createSectionElement({
      activeNodeId: props.activeNodeId,
      editorNodeId: props.editorNodeId,
      nodeOrder: props.nodeOrder,
      nodesById: props.nodesById
    })
  );

  expect(screen.getByRole('region', { name: 'Folder list view' })).toBeInTheDocument();

  view.rerender(
    createSectionElement({
      activeNodeId: 'node-1',
      editorNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: topicNodesById
    })
  );

  expect(screen.getByText('Document body')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Folder list view' })).not.toBeInTheDocument();
});
