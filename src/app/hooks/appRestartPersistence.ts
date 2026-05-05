import type { MutableRefObject } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import { restartMainWindowApp } from '../../shared/platform/windowControls';
import { pushDebugTrace } from '../../shared/testing/debugBridge';
import { toRuntimeNodeViewStates } from '../../store/workspaceReadingProgress';
import type { NodeViewState } from '../../store/workspaceStore';

import { resolvePersistedViewStateSelection } from './persistedViewStateSelection';

interface RestartWithReadingProgressArgs {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getReadingPositionSelection: () => EditorSelection | null;
  isImmersiveMode: boolean;
  isViewingTrashNode: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}

function normalizeViewState(viewState: NodeViewState): NodeViewState {
  return {
    scrollTop: Math.max(0, Math.trunc(viewState.scrollTop)),
    selection: {
      from: Math.max(0, Math.trunc(viewState.selection.from)),
      to: Math.max(0, Math.trunc(viewState.selection.to))
    }
  };
}

function captureReadingProgressForRestart(args: RestartWithReadingProgressArgs) {
  if (args.isViewingTrashNode || !args.activeNodeId || !args.editorRef.current) {
    return null;
  }
  const existingViewState = args.nodeViewById[args.activeNodeId];
  const selection = resolvePersistedViewStateSelection({
    editor: args.editorRef.current,
    isImmersiveMode: args.isImmersiveMode,
    sharedReadingSelection: args.getReadingPositionSelection()
  });
  const viewState = normalizeViewState({
    scrollTop: args.editorRef.current.getScrollTop(),
    selection
  });
  if (
    existingViewState &&
    existingViewState.scrollTop === viewState.scrollTop &&
    existingViewState.selection.from === viewState.selection.from &&
    existingViewState.selection.to === viewState.selection.to
  ) {
    return {
      nodeId: args.activeNodeId,
      viewState
    };
  }
  args.setNodeViewState(args.activeNodeId, viewState);
  return {
    nodeId: args.activeNodeId,
    viewState
  };
}

function mergeRestartNodeViewState(
  captured: ReturnType<typeof captureReadingProgressForRestart>,
  nodeViewById: Record<string, NodeViewState | undefined>
) {
  if (!captured) {
    return nodeViewById;
  }
  return {
    ...nodeViewById,
    [captured.nodeId]: captured.viewState
  };
}

export async function restartAppWithReadingProgress(args: RestartWithReadingProgressArgs) {
  const captured = captureReadingProgressForRestart(args);
  const runtimeInvoke = getRuntimeInvoke();
  const mergedNodeViewById = mergeRestartNodeViewState(captured, args.nodeViewById);
  pushDebugTrace('reading-progress.restart-begin', {
    activeNodeId: args.activeNodeId,
    capturedNodeId: captured?.nodeId ?? null,
    scrollTop: captured?.viewState.scrollTop ?? null,
    selection: captured?.viewState.selection ?? null
  });
  if (captured && runtimeInvoke) {
    try {
      await runtimeInvoke(NATIVE_COMMANDS.saveReadingProgress, {
        activeNodeId: captured.nodeId,
        nodeViewStates: toRuntimeNodeViewStates(mergedNodeViewById),
        updatedAt: new Date().toISOString()
      });
      pushDebugTrace('reading-progress.restart-saved', {
        activeNodeId: captured.nodeId,
        scrollTop: captured.viewState.scrollTop,
        selection: captured.viewState.selection
      });
    } catch (error) {
      pushDebugTrace('reading-progress.restart-save-failed', {
        activeNodeId: captured.nodeId,
        message: error instanceof Error ? error.message : String(error)
      });
      logRuntimeWarning('reading progress save failed before restart', {
        area: 'persistence',
        action: 'restart_app_flush_reading_progress',
        command: NATIVE_COMMANDS.saveReadingProgress,
        fallback: 'restart_without_flush',
        activeNodeId: captured.nodeId,
        error
      });
    }
  }
  pushDebugTrace('reading-progress.restart-command', {
    activeNodeId: captured?.nodeId ?? args.activeNodeId ?? null
  });
  await restartMainWindowApp();
}
