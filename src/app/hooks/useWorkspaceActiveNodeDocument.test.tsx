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

function DualHookHarness(props: { activeNodeId: string | null; trashNodeId: string | null }) {
  useWorkspaceActiveNodeDocument(props.activeNodeId);
  useWorkspaceActiveNodeDocument(props.trashNodeId, { keepWarm: true });
  return null;
}

function seedTrimmedWorkspaceState() {
  const initial = createInitialWorkspaceState(new Date('2026-03-29T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4'],
    nodesById: {
      ...initial.nodesById,
      'node-1': { ...initial.nodesById['node-1'], id: 'node-1', title: 'Node 1', content: '', hasContent: true, reveal: null, hasReveal: true },
      'node-2': { ...initial.nodesById['node-1'], id: 'node-2', title: 'Node 2', content: '', hasContent: true, reveal: null, hasReveal: true },
      'node-3': { ...initial.nodesById['node-1'], id: 'node-3', title: 'Node 3', content: '', hasContent: true, reveal: null, hasReveal: true },
      'node-4': { ...initial.nodesById['node-1'], id: 'node-4', title: 'Node 4', content: '', hasContent: true, reveal: null, hasReveal: true }
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
  await expectNodeDocument('node-2', 'Loaded node 2 body', null);
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({ content: longDocument, reveal: null });
  });
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['node-3']).toMatchObject({ content: '', reveal: null });
  });
  await expectNodeDocument('node-2', 'Loaded node 2 body', null);

  useWorkspaceStore.getState().setNodeViewState('node-1', { scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } });
  useWorkspaceStore.getState().setActiveNode('node-1');
  view.rerender(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument, null);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resetWorkspaceNodeDocumentPrefetchForTest();
  seedTrimmedWorkspaceState();
});

it('keeps the last inactive document warm after switching once', async () => {
  const invoke = createDocumentLoader({
    'node-1': { content: 'Loaded node 1 body', reveal: 'Loaded node 1 answer' },
    'node-2': { content: 'Loaded node 2 body', reveal: 'Loaded node 2 answer' },
    'node-3': { content: 'Loaded node 3 body', reveal: 'Loaded node 3 answer' },
    'node-4': { content: 'Loaded node 4 body', reveal: 'Loaded node 4 answer' }
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', 'Loaded node 1 body', 'Loaded node 1 answer');
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({ content: '', reveal: null });

  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);

  await expectNodeDocument('node-2', 'Loaded node 2 body', 'Loaded node 2 answer');
  expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({
    content: 'Loaded node 1 body',
    reveal: 'Loaded node 1 answer'
  });
  expect(invoke).toHaveBeenNthCalledWith(1, 'load_node_document', { nodeId: 'node-1' });
  expect(invoke).toHaveBeenNthCalledWith(2, 'load_node_document', { nodeId: 'node-2' });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('reopens a recently visited document without loading it again', async () => {
  const invoke = createDocumentLoader({
    'node-1': { content: 'Loaded node 1 body', reveal: 'Loaded node 1 answer' },
    'node-2': { content: 'Loaded node 2 body', reveal: 'Loaded node 2 answer' },
    'node-3': { content: 'Loaded node 3 body', reveal: 'Loaded node 3 answer' },
    'node-4': { content: 'Loaded node 4 body', reveal: 'Loaded node 4 answer' }
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', 'Loaded node 1 body', 'Loaded node 1 answer');

  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);
  await expectNodeDocument('node-2', 'Loaded node 2 body', 'Loaded node 2 answer');
  expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({
    content: 'Loaded node 1 body',
    reveal: 'Loaded node 1 answer'
  });

  useWorkspaceStore.getState().setActiveNode('node-3');
  view.rerender(<HookHarness activeNodeId="node-3" />);
  await expectNodeDocument('node-3', 'Loaded node 3 body', 'Loaded node 3 answer');

  useWorkspaceStore.getState().setActiveNode('node-1');
  view.rerender(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', 'Loaded node 1 body', 'Loaded node 1 answer');
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
    content: 'Loaded node 2 body',
    reveal: 'Loaded node 2 answer'
  });
  expect(useWorkspaceStore.getState().nodesById['node-3']).toMatchObject({
    content: 'Loaded node 3 body',
    reveal: 'Loaded node 3 answer'
  });
  expect(invoke.mock.calls).toEqual([
    ['load_node_document', { nodeId: 'node-1' }],
    ['load_node_document', { nodeId: 'node-2' }],
    ['load_node_document', { nodeId: 'node-3' }]
  ]);
});

it('trims the oldest inactive document once the recent cache limit is exceeded', async () => {
  const invoke = createDocumentLoader({
    'node-1': { content: 'Loaded node 1 body', reveal: 'Loaded node 1 answer' },
    'node-2': { content: 'Loaded node 2 body', reveal: 'Loaded node 2 answer' },
    'node-3': { content: 'Loaded node 3 body', reveal: 'Loaded node 3 answer' },
    'node-4': { content: 'Loaded node 4 body', reveal: 'Loaded node 4 answer' }
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', 'Loaded node 1 body', 'Loaded node 1 answer');

  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);
  await expectNodeDocument('node-2', 'Loaded node 2 body', 'Loaded node 2 answer');

  useWorkspaceStore.getState().setActiveNode('node-3');
  view.rerender(<HookHarness activeNodeId="node-3" />);
  await expectNodeDocument('node-3', 'Loaded node 3 body', 'Loaded node 3 answer');

  useWorkspaceStore.getState().setActiveNode('node-4');
  view.rerender(<HookHarness activeNodeId="node-4" />);
  await expectNodeDocument('node-4', 'Loaded node 4 body', 'Loaded node 4 answer');
  await expectTrimmedNode('node-1', true);
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
    content: 'Loaded node 2 body',
    reveal: 'Loaded node 2 answer'
  });
  expect(useWorkspaceStore.getState().nodesById['node-3']).toMatchObject({
    content: 'Loaded node 3 body',
    reveal: 'Loaded node 3 answer'
  });
  expect(useWorkspaceStore.getState().rendererBoundaryKeepNodeIds).toEqual(['node-3', 'node-2']);
});

it('reopens the same long document without reloading while it is still warm', async () => {
  const longDocument = createLongDocument();
  const invoke = createDocumentLoader({
    'node-1': { content: longDocument, reveal: null },
    'node-2': { content: 'Loaded node 2 body', reveal: null },
    'node-3': { content: 'Loaded node 3 body', reveal: null },
    'node-4': { content: 'Loaded node 4 body', reveal: null }
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument, null);
  await reopenLongDocument(view, longDocument);

  expect(useWorkspaceStore.getState().nodeViewById['node-1']).toMatchObject({
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  });
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
    content: 'Loaded node 2 body',
    reveal: null
  });
  expect(invoke.mock.calls).toEqual([
    ['load_node_document', { nodeId: 'node-1' }],
    ['load_node_document', { nodeId: 'node-2' }]
  ]);
});

it('keeps a selected trash document loaded alongside the active document', async () => {
  const invoke = createDocumentLoader({
    'node-1': { content: 'Loaded node 1 body', reveal: null },
    'node-3': { content: 'Loaded trash node 3 body', reveal: null }
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  render(<DualHookHarness activeNodeId="node-1" trashNodeId="node-3" />);

  await expectNodeDocument('node-1', 'Loaded node 1 body', null);
  await expectNodeDocument('node-3', 'Loaded trash node 3 body', null);

  expect(useWorkspaceStore.getState().rendererBoundaryKeepNodeIds).toEqual(['node-3']);
  expect(invoke.mock.calls).toEqual([
    ['load_node_document', { nodeId: 'node-1' }],
    ['load_node_document', { nodeId: 'node-3' }]
  ]);
});
