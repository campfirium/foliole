import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { resetWorkspaceNodeDocumentPrefetchForTest } from '../../store/workspaceNodeDocumentPrefetch';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function HookHarness({ activeNodeId }: { activeNodeId: string | null }) {
  useWorkspaceActiveNodeDocument(activeNodeId);
  return null;
}

function seedTrimmedWorkspaceState() {
  const initial = createInitialWorkspaceState(new Date('2026-05-17T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        ...initial.nodesById['node-1']!,
        id: 'node-1',
        title: 'Node 1',
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: false
      }
    },
    trashedNodeIds: []
  });
}

function createDocumentLoader() {
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command !== 'load_node_document' || payload?.nodeId !== 'node-1') {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      nodeId: 'node-1',
      content: 'Loaded node 1 body',
      hideTitleHeading: false,
      reveal: null
    });
  });
}

async function expectNodeDocument(content: string) {
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({ content, reveal: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resetWorkspaceNodeDocumentPrefetchForTest();
  seedTrimmedWorkspaceState();
});

it('reloads the current document when a runtime refresh trims the active node body', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(createDocumentLoader());

  render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('Loaded node 1 body');

  useWorkspaceStore.setState((state) => ({
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...state.nodesById['node-1']!,
        bodyStatus: 'ready',
        content: '',
        hasContent: true
      }
    }
  }));

  await expectNodeDocument('Loaded node 1 body');
});
