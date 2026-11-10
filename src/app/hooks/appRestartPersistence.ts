import type { MutableRefObject } from 'react';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';
import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import { restartMainWindowDevApp } from '../../shared/platform/windowControls';
import {
  hasWorkspaceRuntimeRepository,
  saveWorkspaceReadingProgressNow
} from '../../shared/platform/workspaceRuntimeRepository';
import { toRuntimeNodeViewStates } from '../../store/workspaceReadingProgress';
import type { NodeViewState } from '../../store/workspaceStore';

import { captureEditorNodeViewState, isSameNodeViewState } from './useReadingProgressSyncSupport';

interface RestartWithReadingProgressArgs {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getReadingPositionSelection: () => EditorSelection | null;
  isImmersiveMode: boolean;
  isViewingTrashNode: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}

function captureReadingProgressForRestart(args: RestartWithReadingProgressArgs) {
  const captured = captureEditorNodeViewState(
    args.activeNodeId, args.getReadingPositionSelection, args.isImmersiveMode,
    args.isViewingTrashNode, args.editorRef
  );
  if (captured && !isSameNodeViewState(args.nodeViewById[captured.nodeId], captured.viewState)) {
    args.setNodeViewState(captured.nodeId, captured.viewState);
  }
  return captured;
}

export async function restartAppWithReadingProgress(args: RestartWithReadingProgressArgs) {
  const captured = captureReadingProgressForRestart(args);
  pushDebugTrace('reading-progress.restart-begin', {
    activeNodeId: args.activeNodeId,
    capturedNodeId: captured?.nodeId ?? null,
    scrollTop: captured?.viewState.scrollTop ?? null,
    selection: captured?.viewState.selection ?? null
  });
  if (captured && hasWorkspaceRuntimeRepository()) {
    try {
      await saveWorkspaceReadingProgressNow({
        activeNodeId: captured.nodeId,
        nodeViewStates: toRuntimeNodeViewStates({ [captured.nodeId]: captured.viewState }),
        source: 'close-flush',
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
        fallback: 'restart_without_flush',
        activeNodeId: captured.nodeId,
        error
      });
    }
  }
  pushDebugTrace('reading-progress.restart-command', {
    activeNodeId: captured?.nodeId ?? args.activeNodeId ?? null
  });
  await restartMainWindowDevApp();
}
