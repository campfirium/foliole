import { useCallback, useEffect, useRef } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { logRuntimeError } from '../../shared/platform/runtimeLogging';
import { subscribeMainWindowBlur } from '../../shared/platform/windowControls';
import { beginWorkspaceContentEditingSession, endWorkspaceContentEditingSession,
  type WorkspaceContentEditingSession } from '../../store/workspaceContentEditingSession';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { drainPendingNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';
import type { useEditorDraftSync } from '../hooks/useEditorDraftSync';

type Draft = ReturnType<typeof useEditorDraftSync>;

export function useWorkspaceContentEditingSession(nodeId: string | null, readOnly: boolean, draft: Draft) {
  const libraryScope = useWorkspaceStore(state => state.libraryScope);
  const active = useRef<{ session: WorkspaceContentEditingSession; draft: Draft } | null>(null);
  const finish = useCallback(async () => {
    const boundary = active.current;
    if (!boundary || boundary.session.closing) return;
    const { session, draft: input } = boundary;
    session.closing = true;
    try {
      if (useWorkspaceStore.getState().libraryScope !== session.libraryScope) {
        await endWorkspaceContentEditingSession(session);
        if (active.current === boundary) active.current = null;
        return;
      }
      // Composition and buffered editor delivery complete on their real signals.
      await input.settleBufferedInput(session.nodeId);
      if (active.current !== boundary || useWorkspaceStore.getState().libraryScope !== session.libraryScope) return;
      input.flushDraftSynchronously();
      if (!await drainPendingNodeContentRuntimePersist(session.nodeId)) {
        session.closing = false;
        return;
      }
      await endWorkspaceContentEditingSession(session);
      if (active.current === boundary) active.current = null;
    } catch (error) {
      session.closing = false;
      logRuntimeError('editor session could not finish', { area: 'persistence', action: 'content_editing_session', error });
    }
  }, []);
  useEffect(() => {
    const onBlur = () => { void finish(); };
    const unsubscribeNativeBlur = subscribeMainWindowBlur(onBlur);
    window.addEventListener('blur', onBlur);
    return () => { unsubscribeNativeBlur?.(); window.removeEventListener('blur', onBlur); void finish(); };
  }, [finish, libraryScope, nodeId, readOnly]);
  const handleEditorFocus = useCallback(() => {
    const boundary = active.current;
    if (!boundary?.session.closing || readOnly || boundary.session.nodeId !== nodeId ||
        boundary.session.libraryScope !== libraryScope) return;
    const session = beginWorkspaceContentEditingSession(libraryScope, nodeId);
    if (session) active.current = { session, draft };
  }, [draft, libraryScope, nodeId, readOnly]);
  const handleEditorInput = useCallback((meta?: EditorContentChangeMeta) => {
    const sourceNodeId = meta?.nodeId ?? nodeId;
    if (sourceNodeId && !readOnly) {
      const session = beginWorkspaceContentEditingSession(libraryScope, sourceNodeId);
      if (session) active.current = { session, draft };
    }
    draft.handleEditorInput(meta);
  }, [draft, libraryScope, nodeId, readOnly]);
  return { handleEditorFocus, handleEditorInput, finishEditing: finish };
}
