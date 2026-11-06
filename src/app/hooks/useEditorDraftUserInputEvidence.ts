import { useCallback, useEffect, useRef } from 'react';

import { subscribeContentEditAcknowledgements } from '../../store/workspaceContentEditAcknowledgements';

import { useBufferedEditorInput } from './useBufferedEditorInput';
import type { PendingDraftCommit } from './useEditorDraftPendingCommit';

export interface EditorInputBase { content: string; versionId: string | null | undefined }

export function useEditorDraftUserInputEvidence(getPendingDraftCommit: () => PendingDraftCommit | null,
  source: EditorInputBase & { nodeId: string | null }) {
  const { pendingUserInputRef, clearPendingUserInputEvidence, hasBufferedInput, waitForBufferedInput } = useBufferedEditorInput();
  const createdBaseRef = useRef<{ nodeId: string; versionId: string } | null>(null);
  useEffect(() => subscribeContentEditAcknowledgements(event => {
    if (event.type !== 'created' || event.nodeId !== source.nodeId) return;
    createdBaseRef.current = { nodeId: event.nodeId, versionId: event.versionId };
    const input = pendingUserInputRef.current;
    if (input?.nodeId === event.nodeId && input.base && !input.base.versionId) {
      input.base.versionId = event.versionId;
    }
    const pending = getPendingDraftCommit();
    if (pending?.nodeId === event.nodeId && !pending.baseVersionId) pending.baseVersionId = event.versionId;
  }), [getPendingDraftCommit, source.nodeId]);
  const readDraftBaseVersionId = useCallback((nodeId: string) => {
    const input = pendingUserInputRef.current;
    const pending = getPendingDraftCommit();
    return input?.nodeId === nodeId ? input.base?.versionId
      : pending?.nodeId === nodeId ? pending.baseVersionId : null;
  }, [getPendingDraftCommit]);
  const hasFreshDraftEvidence = useCallback((sourceNodeId: string | null, content: string) => {
    if (!sourceNodeId) {
      return false;
    }
    const pendingCommit = getPendingDraftCommit();
    const pendingInput = pendingUserInputRef.current;
    if (pendingCommit?.nodeId === sourceNodeId) {
      return true;
    }
    return pendingInput?.nodeId === sourceNodeId
      && (pendingInput.contentLength === null || pendingInput.contentLength === content.length);
  }, [getPendingDraftCommit]);
  const hasPendingUserInputEvidence = useCallback((sourceNodeId: string | null, content: string) => {
    const pendingInput = pendingUserInputRef.current;
    return Boolean(pendingInput?.nodeId === sourceNodeId
      && (pendingInput.contentLength === null || pendingInput.contentLength === content.length));
  }, []);
  const markPendingUserInputEvidence = useCallback((sourceNodeId: string | null, contentLength: number | null) => {
    const previous = pendingUserInputRef.current;
    const created = createdBaseRef.current;
    const versionId = source.versionId ?? (created?.nodeId === sourceNodeId ? created.versionId : source.versionId);
    const base = previous?.nodeId === sourceNodeId ? previous.base
      : sourceNodeId === source.nodeId ? { content: source.content, versionId } : null;
    pendingUserInputRef.current = { contentLength, nodeId: sourceNodeId, base };
  }, [source.nodeId, source.content, source.versionId]);
  const readInputBase = useCallback((nodeId: string | null) =>
    pendingUserInputRef.current?.nodeId === nodeId ? pendingUserInputRef.current.base : null, []);

  return {
    clearPendingUserInputEvidence,
    hasFreshDraftEvidence,
    hasPendingUserInputEvidence,
    markPendingUserInputEvidence,
    readInputBase,
    hasBufferedInput,
    readDraftBaseVersionId,
    waitForBufferedInput
  };
}
