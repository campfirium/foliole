import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../shared/platform/bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/platform/bridge')>();
  return {
    ...actual,
    getRuntimeInvoke: vi.fn()
  };
});

import './app-smoke.shared';

import { App } from '../app/App';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('keeps the previous node document warm after switching once', async () => {
  const invoke = vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command === 'load_node_document') {
      if (args?.nodeId === 'node-2') {
        return Promise.resolve({
          nodeId: 'node-2',
          content: 'Loaded node 2 body',
          hideTitleHeading: false,
          reveal: null
        });
      }
      return Promise.resolve({
        nodeId: 'node-1',
        content: 'Loaded node 1 body',
        hideTitleHeading: false,
        reveal: null
      });
    }
    if (command === 'search_workspace') {
      return Promise.resolve([]);
    }
    return Promise.resolve(null);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...createNode({ id: 'node-1', title: 'Node 1', content: 'Loaded node 1 body' }),
        hasContent: true,
        hasReveal: false
      },
      'node-2': {
        ...createNode({ id: 'node-2', title: 'Node 2', content: '' }),
        hasContent: true,
        hasReveal: false
      }
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Node 2' }));

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-2']?.content).toBe('Loaded node 2 body');
  });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Loaded node 1 body');
  });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.hasContent).toBe(true);
  expect(useWorkspaceStore.getState().rendererBoundaryKeepNodeIds).toEqual(['node-1']);
  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-2' });
});
