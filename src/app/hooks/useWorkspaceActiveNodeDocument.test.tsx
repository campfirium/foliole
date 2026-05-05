import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function HookHarness({ activeNodeId }: { activeNodeId: string | null }) {
  useWorkspaceActiveNodeDocument(activeNodeId);
  return null;
}

function seedTrimmedWorkspaceState() {
  const initial = createInitialWorkspaceState(new Date('2026-03-29T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...initial.nodesById,
      'node-1': {
        ...initial.nodesById['node-1'],
        id: 'node-1',
        title: 'Node 1',
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: true
      },
      'node-2': {
        ...initial.nodesById['node-1'],
        id: 'node-2',
        title: 'Node 2',
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: true
      }
    },
    trashedNodeIds: []
  });
}

describe('useWorkspaceActiveNodeDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    seedTrimmedWorkspaceState();
  });

  it('loads only the active node document and unloads the previous one after switching', async () => {
    const invoke = vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
      if (command !== 'load_node_document') {
        return Promise.resolve(null);
      }
      if (payload?.nodeId === 'node-1') {
        return Promise.resolve({
          nodeId: 'node-1',
          content: 'Loaded node 1 body',
          hideTitleHeading: false,
          reveal: 'Loaded node 1 answer'
        });
      }
      if (payload?.nodeId === 'node-2') {
        return Promise.resolve({
          nodeId: 'node-2',
          content: 'Loaded node 2 body',
          hideTitleHeading: false,
          reveal: 'Loaded node 2 answer'
        });
      }
      return Promise.resolve(null);
    });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const view = render(<HookHarness activeNodeId="node-1" />);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({
        content: 'Loaded node 1 body',
        reveal: 'Loaded node 1 answer'
      });
    });
    expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
      content: '',
      reveal: null
    });

    useWorkspaceStore.getState().setActiveNode('node-2');
    view.rerender(<HookHarness activeNodeId="node-2" />);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
        content: 'Loaded node 2 body',
        reveal: 'Loaded node 2 answer'
      });
    });

    expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({
      content: '',
      hasContent: true,
      reveal: null,
      hasReveal: true
    });
    expect(invoke).toHaveBeenNthCalledWith(1, 'load_node_document', { nodeId: 'node-1' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'load_node_document', { nodeId: 'node-2' });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
