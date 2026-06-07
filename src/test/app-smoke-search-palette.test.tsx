import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { SearchPalette } from '../app/components/SearchPalette';
import type { WorkspaceSearchResult } from '../app/components/workspaceSearch';
import { toWorkspaceListNodesById } from '../features/nodes/model/workspaceListNode';
import type { ElectronAPI } from '../shared/platform/electronApi';
import { ensureWorkspaceNodeDocumentReady } from '../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, createSmokeRuntimeInvoke } from './app-smoke.shared';

const SEARCH_EXCERPT = '...Atlas launch checklist and follow-up notes....';

function createSearchRuntimeInvoke() {
  const baseInvoke = createSmokeRuntimeInvoke();
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
    return baseInvoke(command, args);
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
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  const invoke = createSearchRuntimeInvoke();
  window.electronAPI = {
    invoke: invoke as ElectronAPI['invoke'],
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  seedSearchNodes();

  expect(useWorkspaceStore.getState().nodesById['node-3']?.hasContent).toBe(true);
  expect(useWorkspaceStore.getState().nodesById['node-3']?.content).toBe('');

  const onOpenResult = vi.fn((result: WorkspaceSearchResult) => {
    void ensureWorkspaceNodeDocumentReady(result.id, { forceLoad: true }).then(() => {
      useWorkspaceStore.getState().setActiveNode(result.id);
    });
  });
  const state = useWorkspaceStore.getState();
  render(
    <SearchPalette
      isOpen
      nodeOrder={state.nodeOrder}
      nodesById={toWorkspaceListNodesById(state.nodesById)}
      onClose={() => undefined}
      onOpenResult={onOpenResult}
      trashedNodeIds={state.trashedNodeIds}
    />
  );

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
  expect(onOpenResult).toHaveBeenCalledWith(expect.objectContaining({ id: 'node-3' }), { preview: false });
  expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
    content: '',
    hasContent: true,
    reveal: null
  });
  expect(useWorkspaceStore.getState().nodesById['node-3']!).toMatchObject({
    content: '',
    hasContent: true,
    reveal: null,
    hasReveal: false
  });
  expect(JSON.stringify(useWorkspaceStore.getState().nodesById)).not.toContain(SEARCH_EXCERPT);
  expect(invoke).toHaveBeenCalledWith('search_workspace', { query: 'Atlas' });
});
