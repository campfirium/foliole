import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './reactPdfMock';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, resetAppSmokeState } from './app-smoke.shared';

const { App } = await import('../app/App');

function mockNodeDocumentLoad() {
  const invoke = vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command === 'load_node_document' && args?.nodeId === 'node-2') {
      return Promise.resolve({
        nodeId: 'node-2',
        content: 'Prompt [...]',
        hideTitleHeading: false,
        reveal: 'Answer'
      });
    }
    return Promise.resolve(null);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
}

it('opens selected node content even when the visible row was preloaded first', async () => {
  mockNodeDocumentLoad();
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA 2',
        content: 'Prompt [...]',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  expect(screen.getByTestId('editor-value')).toHaveValue('# Welcome to Foliole\n\nStart writing markdown here.');
  fireEvent.click(screen.getByRole('treeitem', { name: 'QA 2' }));
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expect(screen.getByTestId('editor-value')).toHaveValue('Prompt [...]');
    expect(screen.getByTestId('answer-editor-value')).toHaveValue('Answer');
  });
});

it('updates active node content from editor changes', async () => {
  resetAppSmokeState();
  render(<App />);
  fireEvent.change(screen.getByTestId('editor-value'), {
    target: { value: 'Alpha Beta Gamma' }
  });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']!?.content).toBe('Alpha Beta Gamma');
  });
});
