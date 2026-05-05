import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { workspacePersistStorage } from '../../store/workspacePersistStorage';
import { readWorkspaceNodesFromPayload } from '../../store/workspacePersistStorage.test-support';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

const mockSetSelection = vi.fn();
const mockSetScrollTop = vi.fn();

vi.mock('../../features/editor/adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    destroy() {}
    focus() {}
    getContent() {
      return '';
    }
    getDocumentPositionAtViewportY() {
      return 0;
    }
    getLineBlockHeight() {
      return 24;
    }
    setContent() {}
    setDiffDecorations() {}
    setHideTitleHeading() {}
    getSelection() {
      return { from: 0, to: 0 };
    }
    setSelection(selection: { from: number; to: number }) {
      mockSetSelection(selection);
    }
    revealSelection() {}
    getScrollTop() {
      return 0;
    }
    setScrollTop(scrollTop: number) {
      mockSetScrollTop(scrollTop);
    }
    getScrollMetrics() {
      return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 };
    }
    replaceSelection() {}
    onContentChange() {
      return () => undefined;
    }
    onScroll() {
      return () => undefined;
    }
  }
}));

function HookHarness({ activeNodeId }: { activeNodeId: string | null }) {
  useWorkspaceActiveNodeDocument(activeNodeId);
  return null;
}

function createLongDocument() {
  return Array.from({ length: 2_500 }, (_, index) => `Paragraph ${index}: ${'Long document body. '.repeat(4)}`).join('\n\n');
}

function createHydrateInvoke(longDocument: string) {
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve({
        activeNodeId: 'node-1',
        nodeOrder: ['node-1', 'node-2'],
        nodesById: {
          'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reveal: null },
          'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: false, reveal: null }
        },
        trashedNodeIds: []
      });
    }
    if (command === 'load_node_document' && payload?.nodeId === 'node-1') {
      return Promise.resolve({ nodeId: 'node-1', content: longDocument, hideTitleHeading: false, reveal: null });
    }
    return Promise.resolve({ activeNodeId: 'node-1', nodeViewStateById: {} });
  });
}

function createDocumentLoader(longDocument: string) {
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command !== 'load_node_document' || !payload?.nodeId) {
      return Promise.resolve(null);
    }
    if (payload.nodeId === 'node-1') {
      return Promise.resolve({ nodeId: 'node-1', content: longDocument, hideTitleHeading: false, reveal: null });
    }
    if (payload.nodeId === 'node-2') {
      return Promise.resolve({ nodeId: 'node-2', content: 'Loaded node 2 body', hideTitleHeading: false, reveal: null });
    }
    return Promise.resolve(null);
  });
}

function seedTrimmedWorkspaceState() {
  const initial = createInitialWorkspaceState(new Date('2026-03-29T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...initial.nodesById,
      'node-1': { ...initial.nodesById['node-1'], id: 'node-1', title: 'Node 1', content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-2': { ...initial.nodesById['node-1'], id: 'node-2', title: 'Node 2', content: '', hasContent: true, reveal: null, hasReveal: false }
    },
    trashedNodeIds: []
  });
}

async function expectNodeDocument(nodeId: string, content: string) {
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById[nodeId]).toMatchObject({ content, reveal: null });
  });
}

async function expectTrimmedNode(nodeId: string) {
  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById[nodeId]).toMatchObject({ content: '', hasContent: true, reveal: null, hasReveal: false });
  });
}

function renderEditor(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRuntimeInvoke).mockReset();
  window.localStorage.clear();
  mockSetSelection.mockClear();
  mockSetScrollTop.mockClear();
  seedTrimmedWorkspaceState();
});

it('allows first open of a long document to read the full body from local persistence', async () => {
  const longDocument = createLongDocument();
  const invoke = createHydrateInvoke(longDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const value = await workspacePersistStorage.getItem('foliole-workspace-v1');
  const nodesById = readWorkspaceNodesFromPayload(value);

  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-1' });
  expect(nodesById?.['node-1']?.content).toBe(longDocument);
  expect(nodesById?.['node-1']?.content.length).toBeGreaterThan(100_000);
  expect(nodesById?.['node-2']?.content).toBe('');
});

it('reopens the same long document stably after switching away', async () => {
  const longDocument = createLongDocument();
  const invoke = createDocumentLoader(longDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument);

  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);
  await expectTrimmedNode('node-1');
  await expectNodeDocument('node-2', 'Loaded node 2 body');

  useWorkspaceStore.getState().setActiveNode('node-1');
  view.rerender(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument);

  expect(invoke.mock.calls).toEqual([
    ['load_node_document', { nodeId: 'node-1' }],
    ['load_node_document', { nodeId: 'node-2' }],
    ['load_node_document', { nodeId: 'node-1' }]
  ]);
});

it('restores a mid-document reading position after content was trimmed from memory', async () => {
  const longDocument = createLongDocument();
  const invoke = createDocumentLoader(longDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument);

  useWorkspaceStore.getState().setNodeViewState('node-1', { scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } });
  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);
  await expectTrimmedNode('node-1');

  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('');
  expect(useWorkspaceStore.getState().nodeViewById['node-1']).toEqual({
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  });

  useWorkspaceStore.getState().setActiveNode('node-1');
  view.rerender(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument);

  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={useWorkspaceStore.getState().nodeViewById['node-1']}
      onChange={vi.fn()}
      value={useWorkspaceStore.getState().nodesById['node-1']?.content ?? ''}
    />
  );

  expect(mockSetSelection).toHaveBeenLastCalledWith({ from: 48_000, to: 48_024 });
  expect(mockSetScrollTop).toHaveBeenLastCalledWith(5_400);
});
