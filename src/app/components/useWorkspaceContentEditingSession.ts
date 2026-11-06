import { useCallback, useEffect, useRef } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { logRuntimeError } from '../../shared/platform/runtimeLogging';
import { subscribeMainWindowBlur } from '../../shared/platform/windowControls';
import { waitForWorkspaceContentCommands } from '../../store/workspaceContentCommands';
import { beginWorkspaceContentEditingSession, endWorkspaceContentEditingSession,
  type WorkspaceContentEditingSession } from '../../store/workspaceContentEditingSession';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { drainPendingNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';
import type { useEditorDraftSync } from '../hooks/useEditorDraftSync';

type Draft = ReturnType<typeof useEditorDraftSync>;

function useEditorSessionWindowExit(finish: () => Promise<void>, libraryScope: string | undefined,
  nodeId: string | null, readOnly: boolean) {
  useEffect(() => {
    const onBlur = () => { void finish(); };
    const unsubscribeNativeBlur = subscribeMainWindowBlur(onBlur);
    window.addEventListener('blur', onBlur);
    return () => { unsubscribeNativeBlur?.(); window.removeEventListener('blur', onBlur); void finish(); };
  }, [finish, libraryScope, nodeId, readOnly]);
}

export function useWorkspaceContentEditingSession(nodeId: string | null, readOnly: boolean, draft: Draft) {
  const libraryScope = useWorkspaceStore(state => state.libraryScope);
  const active = useRef<{ session: WorkspaceContentEditingSession; draft: Draft; finishing?: boolean } | null>(null);
  const finish = useCallback(async () => {
    const boundary = active.current;
    if (!boundary || boundary.finishing || boundary.session.closing) return;
    const { session, draft: input } = boundary;
    boundary.finishing = true;
    try {
      if (useWorkspaceStore.getState().libraryScope !== session.libraryScope) {
        await endWorkspaceContentEditingSession(session);
        if (active.current === boundary) active.current = null;
        return;
      }
      if (!await waitForWorkspaceContentCommands(session.libraryScope, session.nodeId)) {
        boundary.finishing = false;
        return;
      }
      if (active.current !== boundary) return;
      session.closing = true;
      // Composition and buffered editor delivery complete on their real signals.
      await input.settleBufferedInput(session.nodeId);
      if (active.current !== boundary || useWorkspaceStore.getState().libraryScope !== session.libraryScope) return;
      input.flushDraftSynchronously();
      if (!await drainPendingNodeContentRuntimePersist(session.nodeId)) {
        boundary.finishing = false;
        session.closing = false;
        return;
      }
      await endWorkspaceContentEditingSession(session);
      if (active.current === boundary) active.current = null;
    } catch (error) {
      boundary.finishing = false;
      session.closing = false;
      logRuntimeError('editor session could not finish', { area: 'persistence', action: 'content_editing_session', error });
    }
  }, []);
  useEditorSessionWindowExit(finish, libraryScope, nodeId, readOnly);
  const handleEditorFocus = useCallback(() => {
    const boundary = active.current;
    if (!boundary || !(boundary.session.closing || boundary.finishing) || readOnly || boundary.session.nodeId !== nodeId ||
        boundary.session.libraryScope !== libraryScope) return;
    boundary.session.closing = true;
    const session = beginWorkspaceContentEditingSession(libraryScope, nodeId);
    if (session) active.current = { session, draft };
  }, [draft, libraryScope, nodeId, readOnly]);
  const handleEditorInput = useCallback((meta?: EditorContentChangeMeta) => {
    const sourceNodeId = meta?.nodeId ?? nodeId;
    if (sourceNodeId && !readOnly) {
      const session = beginWorkspaceContentEditingSession(libraryScope, sourceNodeId);
      if (session && active.current?.session !== session) active.current = { session, draft };
      else if (active.current) active.current.draft = draft;
    }
    draft.handleEditorInput(meta);
  }, [draft, libraryScope, nodeId, readOnly]);
  return { handleEditorFocus, handleEditorInput, finishEditing: finish };
}
