import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { workspacePersistStorage } from '../../store/workspacePersistStorage';
import { readWorkspaceNodesFromPayload } from '../../store/workspacePersistStorage.test-support';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';

vi.mock('../../shared/platform/runtimeInvoke', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/platform/runtimeInvoke')>();
  return {
    ...actual,
    getRuntimeInvoke: vi.fn()
  };
});

const mockSetSelection = vi.fn();
const mockRevealSelection = vi.fn();
const mockRestoreSelection = vi.fn();

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
    setParagraphMarker() {}
    setSelection(selection: { from: number; to: number }) {
      mockSetSelection(selection);
    }
    restoreSelection(selection: { from: number; to: number }) {
      mockRestoreSelection(selection);
    }
    revealSelection(selection: { from: number; to: number }) {
      mockRevealSelection(selection);
    }
    getScrollTop() {
      return 0;
    }
    setScrollTop() {}
    getScrollMetrics() {
      return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 };
    }
    replaceRange() {}
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
    if (payload.nodeId === 'node-3') {
      return Promise.resolve({ nodeId: 'node-3', content: 'Loaded node 3 body', hideTitleHeading: false, reveal: null });
    }
    if (payload.nodeId === 'node-4') {
      return Promise.resolve({ nodeId: 'node-4', content: 'Loaded node 4 body', hideTitleHeading: false, reveal: null });
    }
    return Promise.resolve(null);
  });
}

function seedTrimmedWorkspaceState() {
  const initial = createInitialWorkspaceState(new Date('2026-03-29T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4'],
    nodesById: {
      ...initial.nodesById,
      'node-1': { ...initial.nodesById['node-1']!, id: 'node-1', title: 'Node 1', content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-2': { ...initial.nodesById['node-1']!, id: 'node-2', title: 'Node 2', content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-3': { ...initial.nodesById['node-1']!, id: 'node-3', title: 'Node 3', content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-4': { ...initial.nodesById['node-1']!, id: 'node-4', title: 'Node 4', content: '', hasContent: true, reveal: null, hasReveal: false }
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
    wrapper: ({ children }) => (
      <LocalizationProvider>
        <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
      </LocalizationProvider>
    )
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRuntimeInvoke).mockReset();
  window.localStorage.clear();
  mockSetSelection.mockClear();
  mockRevealSelection.mockClear();
  mockRestoreSelection.mockClear();
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
  expect(nodesById?.['node-2']?.content).toBe('');
});

it('reopens the same long document from the warm cache after switching away once', async () => {
  const longDocument = createLongDocument();
  const invoke = createDocumentLoader(longDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument);

  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);
  await expectNodeDocument('node-2', 'Loaded node 2 body');
  expect(useWorkspaceStore.getState().nodesById['node-1']!).toMatchObject({ content: longDocument, reveal: null });

  useWorkspaceStore.getState().setActiveNode('node-1');
  view.rerender(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument);

  expect(invoke.mock.calls.filter(([command]) => command === 'load_node_document')).toEqual([
    ['load_node_document', { nodeId: 'node-1' }],
    ['load_node_document', { nodeId: 'node-2' }]
  ]);
});

it('restores a mid-document reading position after the recent cache is eventually trimmed', async () => {
  const longDocument = createLongDocument();
  const invoke = createDocumentLoader(longDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const view = render(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument);

  useWorkspaceStore.getState().setNodeViewState('node-1', { scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } });
  useWorkspaceStore.getState().setActiveNode('node-2');
  view.rerender(<HookHarness activeNodeId="node-2" />);
  await expectNodeDocument('node-2', 'Loaded node 2 body');
  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe(longDocument);

  useWorkspaceStore.getState().setActiveNode('node-3');
  view.rerender(<HookHarness activeNodeId="node-3" />);
  await expectNodeDocument('node-3', 'Loaded node 3 body');

  useWorkspaceStore.getState().setActiveNode('node-4');
  view.rerender(<HookHarness activeNodeId="node-4" />);
  await expectNodeDocument('node-4', 'Loaded node 4 body');
  await expectTrimmedNode('node-1');

  expect(useWorkspaceStore.getState().nodeViewById['node-1']).toMatchObject({
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  });

  useWorkspaceStore.getState().setActiveNode('node-1');
  view.rerender(<HookHarness activeNodeId="node-1" />);
  await expectNodeDocument('node-1', longDocument);

  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      onChange={vi.fn()}
      readingRestoreCommandId="long-document-restore"
      readingRestoreScrollTop={5_400}
      readingSelection={{ from: 48_000, to: 48_024 }}
      value={useWorkspaceStore.getState().nodesById['node-1']?.content ?? ''}
      nodeViewState={useWorkspaceStore.getState().nodeViewById['node-1']!}
    />
  );

  expect(mockSetSelection).toHaveBeenLastCalledWith({ from: 48_000, to: 48_000 });
  expect(mockRestoreSelection).toHaveBeenLastCalledWith({ from: 48_000, to: 48_000 });
  expect(mockRevealSelection).not.toHaveBeenCalled();
});
