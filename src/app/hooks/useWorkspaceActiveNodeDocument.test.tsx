import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

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
      'node-1': { ...initial.nodesById['node-1'], id: 'node-1', title: 'Node 1', content: '', hasContent: true, reveal: null, hasReveal: true },
      'node-2': { ...initial.nodesById['node-1'], id: 'node-2', title: 'Node 2', content: '', hasContent: true, reveal: null, hasReveal: true }
    },
    trashedNodeIds: []
  });
}

function createLongDocument() {
  return Array.from({ length: 2_500 }, (_, index) => `Paragraph ${index}: ${'Long document body. '.repeat(4)}`).join('\n\n');
}

function createDocumentLoader(documentsByNodeId: Record<string, { content: string; reveal: string | null }>) {
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command !== 'load_node_document' || !payload?.nodeId) {
      return Promise.resolve(null);
    }
    const document = documentsByNodeId[payload.nodeId];
    if (!document) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ nodeId: payload.nodeId, content: document.content, hideTitleHeading: false, reveal: document.reveal });
  });
}

async function expectNodeDocument(nodeId: string, content: string, reveal: string | null) {
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById[nodeId]).toMatchObject({ content, reveal });
  });
}

async function expectTrimmedNode(nodeId: string, hasReveal: boolean) {
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById[nodeId]).toMatchObject({ content: '', hasContent: true, reveal: null, hasReveal });
  });
}

async function reopenLongDocument(view: ReturnType<typeof render>, longDocument: string) {
  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);
  await expectTrimmedNode('node-1', false);
  await expectNodeDocument('node-2', 'Loaded node 2 body', null);

  useWorkspaceStore.getState().setNodeViewState('node-1', { scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } });
  useWorkspaceStore.getState().setActiveNode('node-1');
  view.rerender(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument, null);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  seedTrimmedWorkspaceState();
});

it('loads only the active node document and unloads the previous one after switching', async () => {
  const invoke = createDocumentLoader({
    'node-1': { content: 'Loaded node 1 body', reveal: 'Loaded node 1 answer' },
    'node-2': { content: 'Loaded node 2 body', reveal: 'Loaded node 2 answer' }
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', 'Loaded node 1 body', 'Loaded node 1 answer');
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({ content: '', reveal: null });

  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);

  await expectNodeDocument('node-2', 'Loaded node 2 body', 'Loaded node 2 answer');
  await expectTrimmedNode('node-1', true);
  expect(invoke).toHaveBeenNthCalledWith(1, 'load_node_document', { nodeId: 'node-1' });
  expect(invoke).toHaveBeenNthCalledWith(2, 'load_node_document', { nodeId: 'node-2' });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('reopens the same long document stably after switching away and trims inactive content in between', async () => {
  const longDocument = createLongDocument();
  const invoke = createDocumentLoader({
    'node-1': { content: longDocument, reveal: null },
    'node-2': { content: 'Loaded node 2 body', reveal: null }
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument, null);
  await reopenLongDocument(view, longDocument);

  expect(useWorkspaceStore.getState().nodeViewById['node-1']).toEqual({
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  });
  await expectTrimmedNode('node-2', false);
  expect(invoke.mock.calls).toEqual([
    ['load_node_document', { nodeId: 'node-1' }],
    ['load_node_document', { nodeId: 'node-2' }],
    ['load_node_document', { nodeId: 'node-1' }]
  ]);
});
