import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { logRuntimeError } from '../../shared/platform/runtimeLogging';
import { subscribeMainWindowBlur } from '../../shared/platform/windowControls';
import { patchWorkspaceRecord } from '../../shared/workspaceRecordPatch';
import { waitForWorkspaceContentCommands } from '../../store/workspaceContentCommands';
import { beginWorkspaceContentEditingSession, endWorkspaceContentEditingSession,
  isCurrentWorkspaceContentEditingSession, type WorkspaceContentEditingSession } from '../../store/workspaceContentEditingSession';
import { waitForNodeCreateConfirmations } from '../../store/workspaceNodeContentVersionGuard';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { drainPendingNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';
import type { useEditorDraftSync } from '../hooks/useEditorDraftSync';

type Draft = ReturnType<typeof useEditorDraftSync>;
type EditingBoundary = { session: WorkspaceContentEditingSession; draft: Draft; finishing?: boolean;
  departed?: boolean; inputCompletion?: Promise<void> | undefined };
type BoundaryRef = MutableRefObject<EditingBoundary | null>;
type FinishEditingBoundary = (boundary?: EditingBoundary | null) => Promise<void>;

async function waitForInputCompletion(boundary: EditingBoundary) {
  let completion: Promise<void> | undefined;
  do {
    completion = boundary.inputCompletion;
    await completion;
  } while (boundary.inputCompletion !== completion);
}

function leaveEditingBoundary(boundary: EditingBoundary, finish: FinishEditingBoundary) {
  boundary.departed = true;
  boundary.session.closing = true;
  void finish(boundary);
}

function useEditorSessionWindowExit(finish: FinishEditingBoundary, active: BoundaryRef,
  libraryScope: string | undefined, nodeId: string | null, readOnly: boolean) {
  useEffect(() => {
    const onBlur = () => { void finish(); };
    const unsubscribeNativeBlur = subscribeMainWindowBlur(onBlur);
    window.addEventListener('blur', onBlur);
    return () => {
      unsubscribeNativeBlur?.();
      window.removeEventListener('blur', onBlur);
      const boundary = active.current;
      if (boundary && boundary.session.nodeId === nodeId && boundary.session.libraryScope === libraryScope) {
        leaveEditingBoundary(boundary, finish);
      }
    };
  }, [active, finish, libraryScope, nodeId, readOnly]);
}

async function settleEditingBoundary(boundary: EditingBoundary) {
  const { session, draft } = boundary;
  const inLibrary = () => useWorkspaceStore.getState().libraryScope === session.libraryScope;
  if (!isCurrentWorkspaceContentEditingSession(session)) return false;
  if (!inLibrary()) return true;

  const succeeded = await waitForWorkspaceContentCommands(session.libraryScope, session.nodeId);
  // A failed command leaves an explicit exit retryable. A view already left still needs to close.
  if (!succeeded && !boundary.departed) return false;
  await waitForInputCompletion(boundary);
  if (!isCurrentWorkspaceContentEditingSession(session)) return false;
  if (!inLibrary()) return true;

  session.closing = true;
  // Composition and buffered editor delivery complete on their real signals.
  await draft.settleBufferedInput(session.nodeId);
  if (!isCurrentWorkspaceContentEditingSession(session)) return false;
  if (!inLibrary()) return true;
  draft.flushDraftSynchronously(session.nodeId);
  await waitForNodeCreateConfirmations([session.nodeId]);
  if (!isCurrentWorkspaceContentEditingSession(session)) return false;
  return !inLibrary() || await drainPendingNodeContentRuntimePersist(session.nodeId);
}

function releaseEditingDocument({ libraryScope, nodeId }: WorkspaceContentEditingSession) {
  useWorkspaceStore.setState(state => {
    const node = state.nodesById[nodeId];
    if (state.libraryScope !== libraryScope || state.activeNodeId === nodeId || !node) return state;
    // Reconcile this node now that the session no longer retains its document.
    return { nodesById: patchWorkspaceRecord(state.nodesById, { [nodeId]: node }) };
  });
}

function useFinishEditingSession(active: BoundaryRef): FinishEditingBoundary {
  return useCallback(async (boundary = active.current) => {
    if (!boundary || boundary.finishing) return;
    boundary.finishing = true;
    try {
      if (!await settleEditingBoundary(boundary)) return;
      await endWorkspaceContentEditingSession(boundary.session);
      if (active.current === boundary) active.current = null;
      releaseEditingDocument(boundary.session);
    } catch (error) {
      logRuntimeError('editor session could not finish', { area: 'persistence', action: 'content_editing_session', error });
    } finally {
      boundary.finishing = false;
      boundary.session.closing = Boolean(boundary.departed);
    }
  }, [active]);
}

export function useWorkspaceContentEditingSession(nodeId: string | null, readOnly: boolean, draft: Draft) {
  const libraryScope = useWorkspaceStore(state => state.libraryScope);
  const active = useRef<EditingBoundary | null>(null);
  const pendingInput = useRef<{ completion: Promise<void>; libraryScope: string | undefined; nodeId: string | null } | null>(null);
  const finish = useFinishEditingSession(active);
  useEditorSessionWindowExit(finish, active, libraryScope, nodeId, readOnly);
  const finishEditing = useCallback(() => finish(), [finish]);
  const settleAcceptedInput = useCallback(async () => {
    let input: typeof pendingInput.current;
    do {
      input = pendingInput.current;
      if (input?.libraryScope === libraryScope && input?.nodeId === nodeId) await input.completion;
    } while (pendingInput.current !== input);
    if (useWorkspaceStore.getState().libraryScope !== libraryScope) return false;
    if (nodeId) await draft.settleBufferedInput(nodeId);
    return useWorkspaceStore.getState().libraryScope === libraryScope;
  }, [draft, libraryScope, nodeId]);
  const handlePendingInput = useCallback((completion: Promise<void>) => {
    pendingInput.current = { completion, libraryScope, nodeId };
    const boundary = active.current;
    if (boundary && boundary.session.libraryScope === libraryScope && boundary.session.nodeId === nodeId) {
      boundary.inputCompletion = completion;
    }
  }, [libraryScope, nodeId]);
  const handleEditorFocus = useCallback(() => {
    const boundary = active.current;
    if (!boundary || !(boundary.session.closing || boundary.finishing) || readOnly || boundary.session.nodeId !== nodeId ||
        boundary.session.libraryScope !== libraryScope) return;
    boundary.session.closing = true;
    const session = beginWorkspaceContentEditingSession(libraryScope, nodeId);
    if (session) active.current = { session, draft, inputCompletion: boundary.inputCompletion };
  }, [draft, libraryScope, nodeId, readOnly]);
  const handleEditorInput = useCallback((meta?: EditorContentChangeMeta) => {
    const sourceNodeId = meta?.nodeId ?? nodeId;
    // A delivery for the previous topic belongs to its departing boundary.
    if (sourceNodeId && sourceNodeId === nodeId && !readOnly) {
      const previous = active.current;
      if (previous && (previous.session.nodeId !== sourceNodeId || previous.session.libraryScope !== libraryScope)) {
        leaveEditingBoundary(previous, finish);
      }
      const session = beginWorkspaceContentEditingSession(libraryScope, sourceNodeId);
      if (session && active.current?.session !== session) {
        const input = pendingInput.current;
        active.current = { session, draft, inputCompletion:
          input && input.libraryScope === libraryScope && input.nodeId === sourceNodeId ? input.completion : undefined };
      }
      else if (active.current) active.current.draft = draft;
    }
    draft.handleEditorInput(meta);
  }, [draft, finish, libraryScope, nodeId, readOnly]);
  return { handleEditorFocus, handleEditorInput, handlePendingInput, finishEditing, settleAcceptedInput };
}
