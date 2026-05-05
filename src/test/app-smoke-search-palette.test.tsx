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

function createSearchRuntimeInvoke() {
  return vi.fn().mockImplementation((command: string, args?: { nodeId?: string; query?: string }) => {
    if (command === 'search_workspace') {
      expect(args).toEqual({ query: 'Atlas' });
      return Promise.resolve([
        { id: 'node-2', title: 'Project Atlas', excerpt: '...Project Atlas...' },
        { id: 'node-3', title: 'Weekly Log', excerpt: '...Atlas launch checklist and follow-up notes....' }
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

it('opens workspace search with Ctrl+K and searches node titles and content', async () => {
  const invoke = createSearchRuntimeInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  seedSearchNodes();

  expect(useWorkspaceStore.getState().nodesById['node-2']?.content).toBe('');
  expect(useWorkspaceStore.getState().nodesById['node-2']?.hasContent).toBe(true);
  expect(useWorkspaceStore.getState().nodesById['node-3']?.content).toBe('');
  expect(useWorkspaceStore.getState().nodesById['node-3']?.hasContent).toBe(true);

  render(<App />);

  fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
  const dialog = screen.getByRole('dialog', { name: 'Workspace search' });
  const input = within(dialog).getByLabelText('Search workspace');

  fireEvent.change(input, { target: { value: 'Atlas' } });

  await waitFor(() => {
    expect(within(dialog).getByRole('button', { name: /Project Atlas/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Weekly Log/i })).toBeInTheDocument();
  });

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
  });
  expect(invoke).toHaveBeenCalledWith('search_workspace', { query: 'Atlas' });
  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-3' });
  expect(screen.queryByRole('dialog', { name: 'Workspace search' })).not.toBeInTheDocument();
});
