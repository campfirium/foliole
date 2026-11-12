import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, createSmokeRuntimeInvoke, getCurrentFolderTreeItem } from './app-smoke.shared';

const { App } = await import('../app/App');

function mockRuntimeForDocumentSwitch() {
  const baseInvoke = createSmokeRuntimeInvoke();
  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'load_node_document' && (args?.nodeId === 'node-1' || args?.nodeId === 'node-2')) {
      return {
        nodeId: args.nodeId,
        kind: 'topic',
        content: args.nodeId === 'node-1' ? 'Loaded node 1 body' : 'Loaded node 2 body',
        hideTitleHeading: false,
        reveal: null
      };
    }
    if (command === 'search_workspace') {
      return { aliasSpellings: [], hasMore: false, results: [], revision: 0, snapshotId: 'smoke' };
    }
    if (command === 'consume_guided_sample_startup') return { rootNodeId: null };
    if (command === 'load_import_overview') {
      return { latest_failure: null, latest_result: null, recent_runs: [] };
    }
    return baseInvoke(command, args);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  return invoke;
}

it('keeps the previous node document warm after switching once', async () => {
  const invoke = mockRuntimeForDocumentSwitch();
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...createNode({ id: 'node-1', parentNodeId: INBOX_NODE_ID, title: 'Node 1', content: 'Loaded node 1 body' }),
        hasContent: true,
        hasReveal: false
      },
      'node-2': {
        ...createNode({ id: 'node-2', parentNodeId: INBOX_NODE_ID, title: 'Node 2', content: '' }),
        hasContent: true,
        hasReveal: false
      }
    }
  }));

  render(<App />);
  expect(await screen.findByTestId('editor-value')).toHaveValue('Loaded node 1 body');

  fireEvent.click(getCurrentFolderTreeItem('Node 2'));

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expect(screen.getByTestId('editor-value')).toHaveValue('Loaded node 2 body');
    expect(useWorkspaceStore.getState().nodesById['node-2']?.content).toBe('Loaded node 2 body');
  });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('');
  });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.hasContent).toBe(true);
  fireEvent.click(getCurrentFolderTreeItem('Node 1'));
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
    expect(screen.getByTestId('editor-value')).toHaveValue('Loaded node 1 body');
    expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Loaded node 1 body');
  });
  expect(invoke.mock.calls.filter(([command]) => command === 'load_node_document')).toEqual([
    ['load_node_document', { nodeId: 'node-2' }]
  ]);
  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-2' });
});
