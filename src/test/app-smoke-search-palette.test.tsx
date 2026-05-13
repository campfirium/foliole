import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import './app-smoke.shared';

import { App } from '../app/App';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

const SEARCH_EXCERPT = '...Atlas launch checklist and follow-up notes....';

function createSearchRuntimeInvoke() {
  return vi.fn().mockImplementation((command: string, args?: { nodeId?: string; query?: string }) => {
    if (command === 'search_workspace') {
      expect(args).toEqual({ query: 'Atlas' });
      return Promise.resolve([
        {
          externalMatch: null,
          id: 'node-2',
          title: 'Project Atlas',
          excerpt: '...Project Atlas...',
          kind: 'node',
          nodeMatch: null,
          pdfMatch: null,
          updatedAt: '2026-03-30T00:00:00.000Z'
        },
        {
          externalMatch: null,
          id: 'node-3',
          title: 'Weekly Log',
          excerpt: '...Atlas launch checklist and follow-up notes....',
          kind: 'node',
          nodeMatch: {
            from: 0,
            query: 'atlas',
            to: 5
          },
          pdfMatch: null,
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      ]);
    }
    if (command === 'load_node_document' && args?.nodeId === 'node-3') {
      return Promise.resolve({
        nodeId: 'node-3',
        content: 'Atlas launch checklist and follow-up notes.',
        hideTitleHeading: false,
        reveal: null
      });
    }
    return Promise.resolve(null);
  });
}

function seedSearchNodes() {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        title: 'Project Atlas',
        content: 'This note tracks rollout details.'
      }),
      'node-3': createNode({
        id: 'node-3',
        title: 'Weekly Log',
        content: 'Atlas launch checklist and follow-up notes.'
      })
    }
  }));
}

it('keeps search results lightweight until the chosen node is opened', async () => {
  const invoke = createSearchRuntimeInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  seedSearchNodes();

  expect(useWorkspaceStore.getState().nodesById['node-3']!?.hasContent).toBe(true);
  expect(useWorkspaceStore.getState().nodesById['node-4']!?.hasContent).toBe(true);
  expect(useWorkspaceStore.getState().nodesById['node-5']!?.content).toBe('');
  expect(useWorkspaceStore.getState().nodesById['node-5']!?.hasContent).toBe(true);

  render(<App />);

  fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
  const dialog = screen.getByRole('dialog', { name: 'Workspace search' });
  const input = within(dialog).getByLabelText('Search workspace');

  fireEvent.change(input, { target: { value: 'Atlas' } });

  await waitFor(() => {
    expect(within(dialog).getByRole('button', { name: /Project Atlas/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Weekly Log/i })).toBeInTheDocument();
  });
  expect(within(within(dialog).getByRole('button', { name: /Weekly Log/i })).getByText(/launch checklist and follow-up notes/i)).toBeInTheDocument();
  expect(JSON.stringify(useWorkspaceStore.getState().nodesById)).not.toContain(SEARCH_EXCERPT);
  expect(invoke.mock.calls.filter(([command]) => command === 'load_node_document')).toEqual([]);

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
  });
  expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
    content: '',
    hasContent: true,
    reveal: null
  });
  expect(useWorkspaceStore.getState().nodesById['node-3']!).toMatchObject({
    content: 'Atlas launch checklist and follow-up notes.',
    hasContent: true,
    reveal: null,
    hasReveal: false
  });
  expect(useWorkspaceStore.getState().nodeViewById['node-3']).toMatchObject({
    selection: { from: 0, to: 5 }
  });
  expect(JSON.stringify(useWorkspaceStore.getState().nodesById)).not.toContain(SEARCH_EXCERPT);
  expect(invoke).toHaveBeenCalledWith('search_workspace', { query: 'Atlas' });
  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-3' });
  expect(invoke.mock.calls).toContainEqual(['load_node_document', { nodeId: 'node-3' }]);
  expect(screen.queryByRole('dialog', { name: 'Workspace search' })).not.toBeInTheDocument();
});
