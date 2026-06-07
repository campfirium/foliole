import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './reactPdfMock';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, createSmokeRuntimeInvoke, resetAppSmokeState } from './app-smoke.shared';

const { App } = await import('../app/App');

function mockNodeDocumentLoad() {
  const baseInvoke = createSmokeRuntimeInvoke();
  const invoke = vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command === 'load_node_document' && args?.nodeId === 'node-2') {
      return Promise.resolve({
        nodeId: 'node-2',
        content: 'Prompt [...]',
        hideTitleHeading: false,
        reveal: 'Answer'
      });
    }
    return baseInvoke(command, args);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
}

it('opens selected node content even when the visible row was preloaded first', async () => {
  mockNodeDocumentLoad();
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: INBOX_NODE_ID,
        title: 'QA 2',
        content: 'Prompt [...]',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('treeitem', { name: 'QA 2' }));
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expect(screen.getByTestId('editor-value')).toHaveValue('Prompt [...]');
  });
});

it('updates active node content from editor changes', async () => {
  resetAppSmokeState();
  render(<App />);
  fireEvent.change(screen.getByTestId('editor-value'), {
    target: { value: 'Alpha Beta Gamma' }
  });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Alpha Beta Gamma');
  });
});
