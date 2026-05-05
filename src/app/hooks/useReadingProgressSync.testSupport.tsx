import { useRef, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { NodeViewState } from '../../store/workspaceStore';

import { useReadingProgressSync } from './useReadingProgressSync';

export interface HarnessProps {
  activeNodeId: string | null;
  isImmersiveMode?: boolean;
  readingSelection?: { from: number; to: number } | null;
  readingPositionSyncState?: { reason: string; startedAt: number; targetSelection: { from: number; to: number } } | null;
  isWorkspaceHydrated: boolean;
  nodeViewById?: Record<string, NodeViewState | undefined>;
  scrollTop?: number;
  selection?: { from: number; to: number };
  setNodeViewState?: (nodeId: string, viewState: NodeViewState) => void;
}

export function createEditorRef(
  scrollTop: number,
  selection: { from: number; to: number }
): MutableRefObject<{
  getScrollTop: () => number;
  getSelection: () => { from: number; to: number };
  onScroll: (listener: () => void) => () => void;
} | null> {
  const scrollListeners = new Set<() => void>();
  return {
    current: {
      getScrollTop: () => scrollTop,
      getSelection: () => selection,
      onScroll: (listener: () => void) => {
        scrollListeners.add(listener);
        return () => {
          scrollListeners.delete(listener);
        };
      }
    }
  };
}

export function HookHarness({
  activeNodeId,
  readingSelection = null,
  readingPositionSyncState = null,
  isImmersiveMode = false,
  isWorkspaceHydrated,
  nodeViewById = {},
  scrollTop = 120,
  selection = { from: 8, to: 13 },
  setNodeViewState = () => undefined
}: HarnessProps) {
  const editorRef = useRef<EditorAdapter | null>(
    createEditorRef(scrollTop, selection).current as unknown as EditorAdapter
  );
  editorRef.current = createEditorRef(scrollTop, selection).current as unknown as EditorAdapter;
  useReadingProgressSync({
    activeNodeId,
    editorRef,
    getReadingPositionSelection: () => readingSelection,
    getReadingPositionSyncState: () => readingPositionSyncState,
    isImmersiveMode,
    isViewingTrashNode: false,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState
  });
  return null;
}

export function buildNodeSwitchHarnessProps(
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void
): HarnessProps {
  return {
    activeNodeId: 'node-2',
    isWorkspaceHydrated: true,
    nodeViewById: {
      'node-2': {
        scrollTop: 24,
        selection: { from: 2, to: 6 }
      }
    },
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 },
    setNodeViewState
  };
}

export function buildPreviousNodeHarnessProps(
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void
): HarnessProps {
  return {
    activeNodeId: 'node-1',
    isWorkspaceHydrated: true,
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 },
    setNodeViewState
  };
}
