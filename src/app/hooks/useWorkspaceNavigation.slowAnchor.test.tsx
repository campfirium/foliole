import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { removeCachedWorkspaceNodeDocument } from '../../store/workspaceNodeDocumentCache';
import { resetWorkspaceNodeDocumentLoaderForTest } from '../../store/workspaceNodeDocumentLoader';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useActiveNodeReadingPositionRestore, useNavigationReadingPosition } from './appControllerNavigationReadingPosition';
import { useAppRuntime } from './useAppRuntime';
import { PREPARED_OPEN_MAX_WAIT_MS } from './usePreparedNodeSelectionActions';
import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import { resetWorkspaceNavigationTestState, seedPrefetchTestState } from './useWorkspaceNavigation.testSupport';

const excerpt = 'node-1';
const original = 'node-2';
const other = 'pdf-parent';
const prefix = 'Inserted before ';
const text = 'needle';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  resetWorkspaceNavigationTestState();
  resetWorkspaceNodeDocumentLoaderForTest();
  [excerpt, original, other].forEach(removeCachedWorkspaceNodeDocument);
  seedPrefetchTestState();
  useWorkspaceStore.setState(state => ({
    nodeOrder: [...state.nodeOrder, other],
    nodesById: {
      ...state.nodesById,
      [excerpt]: {
        ...state.nodesById[excerpt]!,
        parentNodeId: original,
        anchorLink: { id: 'highlight', kind: 'highlight', locator: { from: 0, originalText: text, to: text.length } }
      },
      [other]: { ...state.nodesById[other]!, hasContent: true, hasReveal: false }
    }
  }));
});

afterEach(() => {
  vi.useRealTimers();
  delete window.electronAPI;
});

function useReaderNavigation() {
  const workspace = useWorkspaceStore();
  const { activeNodeId, nodesById, nodeViewById } = workspace;
  const active = activeNodeId ? nodesById[activeNodeId] : undefined;
  useWorkspaceActiveNodeDocument(activeNodeId);
  const runtime = useAppRuntime(workspace.layout.listWidth, workspace.layout.rightSidebarWidth);
  const reading = useNavigationReadingPosition(runtime, nodeViewById, workspace.setNodeViewState, nodesById);
  useActiveNodeReadingPositionRestore(runtime, activeNodeId, nodeViewById, true);
  const navigation = useWorkspaceNavigation({
    ...workspace,
    ...reading,
    activeNodeContent: active?.content ?? null,
    activeNodeParentId: active?.parentNodeId ?? null,
    backStackSize: workspace.navigation.backStack.length,
    closeContextMenu: () => undefined,
    editorRef: runtime.editorRef,
    flushPendingEditorDraft: () => undefined,
    flushPendingEditorDraftImmediately: async () => true,
    forwardStackSize: workspace.navigation.forwardStack.length,
    saveActiveNodeView: () => undefined
  });
  return { navigation, runtime };
}

function connectDeferredDocuments() {
  const loads = new Map<string, (document: unknown) => void>();
  const invoke = vi.fn(async (command: string, args?: { nodeId: string }) => {
    if (command === NATIVE_COMMANDS.loadNodeDocument && args?.nodeId) {
      const nodeId = args.nodeId;
      return new Promise(resolve => { loads.set(nodeId, resolve); });
    }
    if (command === NATIVE_COMMANDS.loadReadingResume && args?.nodeId === original) {
      return { nodeId: original, contentHash: 'a'.repeat(64), libraryEpoch: 'library', clock: {}, offset: 3 };
    }
    return null;
  });
  const unlisten = () => () => undefined;
  window.electronAPI = {
    invoke: invoke as unknown as NativeInvoke,
    onManagedInboxUpdated: unlisten,
    onNativeMenuCommand: unlisten,
    onSearchIndexRebuildStatus: unlisten,
    onWindowResized: unlisten
  };
  return (nodeId: string, content: string) => {
    const resolve = loads.get(nodeId);
    expect(resolve).toBeDefined();
    resolve?.({ content, hideTitleHeading: false, kind: 'topic', reveal: null, virtualFilter: null });
  };
}

it.each([false, true])('reveals a slow original only while its breadcrumb request is current (later click: %s)', async (navigateAgain) => {
  const completeBody = connectDeferredDocuments();
  const view = renderHook(useReaderNavigation);

  await act(async () => {
    view.result.current.navigation.handleSelectBreadcrumbNode(original);
    await vi.advanceTimersByTimeAsync(PREPARED_OPEN_MAX_WAIT_MS);
  });
  expect(useWorkspaceStore.getState().activeNodeId).toBe(original);
  expect(isNodeDocumentLoaded(useWorkspaceStore.getState().nodesById[original])).toBe(false);
  const runtime = view.result.current.runtime;
  expect(runtime.readingPositionRestoreCommandRef.current.command).toMatchObject({ reason: 'active-node-restore' });

  if (navigateAgain) {
    await act(async () => { view.result.current.navigation.handleSelectNode(other); });
  }
  await act(async () => completeBody(original, prefix + text));
  expect(useWorkspaceStore.getState().nodesById[original]?.content).toBe(prefix + text);

  if (navigateAgain) {
    expect(runtime.readingPositionRestoreCommandRef.current.command).toMatchObject({ reason: 'active-node-restore' });
    await act(async () => completeBody(other, 'Another note'));
    expect(useWorkspaceStore.getState().activeNodeId).toBe(other);
  } else {
    expect(runtime.readingPositionRestoreCommandRef.current.command).toMatchObject({
      nodeId: original,
      reason: 'anchor-navigation',
      selection: { from: prefix.length, to: prefix.length },
      targetViewportMode: 'center'
    });
    const sequence = runtime.readingPositionRestoreCommandSeqRef.current;
    view.rerender();
    expect(runtime.readingPositionRestoreCommandSeqRef.current).toBe(sequence);
  }
});
