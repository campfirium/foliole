import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { baseNode, renderSectionWithProps } from './DocumentPanelSection.testSupport';

it('shows combined results when the Virtual root is open', () => {
  const onSelectNode = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();

  renderSectionWithProps({
    activeNodeId: 'special-virtual-root',
    editorNodeId: 'special-virtual-root',
    nodeOrder: ['special-virtual-root', 'node-1', 'node-2', 'node-3'],
    nodesById: {
      'special-virtual-root': {
        ...baseNode,
        id: 'special-virtual-root',
        kind: 'folder',
        specialKind: 'virtual-root',
        title: 'Virtual'
      },
      'node-1': {
        ...baseNode,
        id: 'node-1',
        kind: 'folder',
        parentNodeId: 'special-virtual-root',
        specialKind: 'virtual',
        title: 'Saved search',
        virtualFilter: {
          version: 1,
          match: 'all',
          conditions: [{ field: 'text', operator: 'contains', value: 'reader' }]
        }
      },
      'node-2': {
        ...baseNode,
        id: 'node-2',
        title: 'Reader article',
        content: 'A reader note that should appear in the combined list.'
      },
      'node-3': {
        ...baseNode,
        id: 'node-3',
        title: 'Other article',
        content: 'No match here.'
      }
    },
    onSelectNode,
    onSelectNodeInVirtualView
  });

  expect(screen.getByRole('region', { name: 'Virtual folder details' })).toBeInTheDocument();
  expect(screen.getByText('Results')).toBeInTheDocument();
  expect(screen.getByTestId('folder-list-title-node-2')).toHaveTextContent('Reader article');
  expect(screen.queryByTestId('folder-list-title-node-3')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open Reader article' }));

  expect(onSelectNodeInVirtualView).toHaveBeenCalledWith('node-2');

  fireEvent.click(screen.getByRole('button', { name: 'Open real location for Reader article' }));

  expect(onSelectNode).toHaveBeenCalledWith('node-2');
});
