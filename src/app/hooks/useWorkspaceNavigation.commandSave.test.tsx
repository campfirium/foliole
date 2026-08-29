import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { registerActiveNodeRenameCommit } from '../../features/nodes/components/nodeRenameCommitCapability';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';

const { markNodeSelectionRequested } = vi.hoisted(() => ({ markNodeSelectionRequested: vi.fn() }));

vi.mock('../../shared/platform/performanceDiagnosticsProbe', () => ({
  markNodeDocumentMerged: vi.fn(),
  markNodeDocumentLoadResolved: vi.fn(),
  markNodeDocumentLoadStarted: vi.fn(),
  markNodePositionRequested: vi.fn(),
  markNodeSelectionApplied: vi.fn(),
  markNodeSelectionRequested
}));

let unregisterRename: () => void = () => undefined;

beforeEach(() => {
  vi.clearAllMocks();
  const initial = createInitialWorkspaceState(new Date('2026-08-29T00:00:00.000Z'));
  const seed = initial.nodesById['node-1']!;
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'current',
    navigation: { backStack: ['target'], forwardStack: [] },
    nodeOrder: ['target', 'current'],
    nodesById: {
      current: { ...seed, content: 'Current body', hasContent: true, id: 'current', title: 'Current' },
      target: { ...seed, content: 'Target body', hasContent: true, id: 'target', title: 'Target' }
    }
  });
});

afterEach(() => unregisterRename());

function renderSaveHarness(args: {
  bodySaveResult?: boolean;
  callOrder: string[];
  onBodySave?: () => void;
  titleSaveResult?: boolean;
}) {
  unregisterRename = registerActiveNodeRenameCommit(async () => {
    args.callOrder.push('title-save');
    return args.titleSaveResult ?? true;
  });
  const goBack = vi.fn(() => {
    args.callOrder.push('navigate');
    return { focusAnchor: null, nodeId: 'target' };
  });
  const view = renderHook(() => useWorkspaceNavigation({
    activeNodeContent: 'Current body',
    activeNodeId: 'current',
    activeNodeParentId: null,
    backStackSize: 1,
    closeContextMenu: vi.fn(),
    editorRef: { current: null },
    flushActiveEditorTransaction: vi.fn(() => {
      args.callOrder.push('editor-transaction');
      return true;
    }),
    flushPendingEditorDraft: vi.fn(),
    flushPendingEditorDraftImmediately: vi.fn(async () => {
      args.callOrder.push('body-save');
      args.onBodySave?.();
      return args.bodySaveResult ?? true;
    }),
    forwardStackSize: 0,
    goBack,
    goForward: vi.fn(() => null),
    goToParent: vi.fn(() => null),
    jumpToAncestorNode: vi.fn(() => null),
    nodesById: useWorkspaceStore.getState().nodesById,
    openNode: vi.fn(() => null),
    saveActiveNodeView: vi.fn(() => args.callOrder.push('save-view'))
  }));
  return { goBack, result: view.result };
}

it('saves title, body, and reading position before a four-way navigation transition', async () => {
  const callOrder: string[] = [];
  const { result } = renderSaveHarness({ callOrder });

  await act(async () => result.current.handleGoBack());

  expect(callOrder).toEqual(['editor-transaction', 'title-save', 'body-save', 'save-view', 'navigate']);
});

it('cancels navigation when title saving fails', async () => {
  const callOrder: string[] = [];
  const { goBack, result } = renderSaveHarness({ callOrder, titleSaveResult: false });

  await act(async () => result.current.handleGoBack());

  expect(callOrder).toEqual(['editor-transaction', 'title-save']);
  expect(goBack).not.toHaveBeenCalled();
});

it('cancels navigation when body saving fails', async () => {
  const callOrder: string[] = [];
  const { goBack, result } = renderSaveHarness({ bodySaveResult: false, callOrder });

  await act(async () => result.current.handleGoBack());

  expect(callOrder).toEqual(['editor-transaction', 'title-save', 'body-save']);
  expect(goBack).not.toHaveBeenCalled();
});

it('uses the navigation target resolved after saving succeeds', async () => {
  const callOrder: string[] = [];
  const target = useWorkspaceStore.getState().nodesById.target!;
  const { result } = renderSaveHarness({
    callOrder,
    onBodySave: () => useWorkspaceStore.setState((state) => ({
      navigation: { backStack: ['post-save-target'], forwardStack: [] },
      nodeOrder: [...state.nodeOrder, 'post-save-target'],
      nodesById: { ...state.nodesById, 'post-save-target': { ...target, id: 'post-save-target' } }
    }))
  });

  await act(async () => result.current.handleGoBack());

  expect(markNodeSelectionRequested).toHaveBeenCalledWith('post-save-target', expect.any(Object));
});
