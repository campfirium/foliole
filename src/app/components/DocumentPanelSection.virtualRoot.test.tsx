import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { baseNode, renderSectionWithProps } from './DocumentPanelSection.testSupport';

function renderVirtualRootSection(args: {
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
}) {
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
    onSelectNode: args.onSelectNode,
    onSelectNodeInVirtualView: args.onSelectNodeInVirtualView
  });
}

it('shows the Virtual root save search control in the document panel', async () => {
  const onSelectNode = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();
  useWorkspaceStore.setState({
    createVirtualNode: vi.fn(async () => 'virtual-new'),
    updateNodeTitle: vi.fn(async () => true),
    updateVirtualNodeFilter: vi.fn()
  });

  renderVirtualRootSection({ onSelectNode, onSelectNodeInVirtualView });

  expect(screen.queryByRole('region', { name: 'Virtual folder details' })).not.toBeInTheDocument();
  expect(screen.queryByText('Results')).not.toBeInTheDocument();
  expect(screen.queryByTestId('folder-list-title-node-2')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Virtual search' })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Search topics to save as list' })).toHaveAttribute(
    'placeholder',
    'Search topics to save as list'
  );

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics to save as list' }), {
    target: { value: 'reader' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save search' }));

  await waitFor(() => expect(useWorkspaceStore.getState().createVirtualNode).toHaveBeenCalled());
  expect(useWorkspaceStore.getState().updateVirtualNodeFilter).toHaveBeenCalledWith('virtual-new', 'reader');
  expect(useWorkspaceStore.getState().updateNodeTitle).toHaveBeenCalledWith('virtual-new', 'reader');
  expect(onSelectNode).not.toHaveBeenCalled();
  expect(onSelectNodeInVirtualView).not.toHaveBeenCalled();
});
