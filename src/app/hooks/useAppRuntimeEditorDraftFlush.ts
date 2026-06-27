import { useCallback, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { flushDirtyWorkspaceNodeSyncVersions } from '../../shared/platform/workspaceRuntimeRepository';
import { drainPendingNodeContentRuntimePersists } from '../../store/workspaceStoreContentRuntimePersist';

export type EditorDraftFreshFlush = (sourceNodeId: string | null, content: string) => boolean;

export interface EditorDraftFlushRefs {
  editorDraftCloseFlushRef: MutableRefObject<(() => Promise<boolean>) | null>;
  editorDraftFlushRef: MutableRefObject<(() => boolean) | null>;
  editorDraftFreshFlushRef: MutableRefObject<EditorDraftFreshFlush | null>;
  editorRef: MutableRefObject<EditorAdapter | null>;
}

function useFlushActiveEditorTransaction(refs: EditorDraftFlushRefs) {
  return useCallback((sourceNodeId: string | null = null) => {
    const content = refs.editorRef.current?.getContent();
    if (content === undefined) {
      return false;
    }
    return refs.editorDraftFreshFlushRef.current?.(sourceNodeId, content) ?? false;
  }, [refs.editorDraftFreshFlushRef, refs.editorRef]);
}

export function useEditorDraftFlushRegistry(refs: EditorDraftFlushRefs) {
  const flushActiveEditorTransaction = useFlushActiveEditorTransaction(refs);
  const flushPendingEditorDraft = useCallback(
    () => flushActiveEditorTransaction(null) || refs.editorDraftFlushRef.current?.() || false,
    [flushActiveEditorTransaction, refs.editorDraftFlushRef]
  );
  const flushPendingEditorDraftImmediately = useCallback(
    async () => {
      flushActiveEditorTransaction(null);
      const draftFlushed = (await refs.editorDraftCloseFlushRef.current?.()) ?? true;
      try {
        const contentFlushed = await drainPendingNodeContentRuntimePersists();
        await flushDirtyWorkspaceNodeSyncVersions();
        return draftFlushed && contentFlushed;
      } catch {
        return false;
      }
    },
    [flushActiveEditorTransaction, refs.editorDraftCloseFlushRef]
  );
  const registerPendingEditorDraftFlush = useCallback(
    (
      flush: (() => boolean) | null,
      closeFlush: (() => Promise<boolean>) | null,
      freshFlush: EditorDraftFreshFlush | null = null
    ) => {
      refs.editorDraftFlushRef.current = flush;
      refs.editorDraftCloseFlushRef.current = closeFlush;
      refs.editorDraftFreshFlushRef.current = freshFlush;
    },
    [refs.editorDraftCloseFlushRef, refs.editorDraftFlushRef, refs.editorDraftFreshFlushRef]
  );
  return {
    flushActiveEditorTransaction,
    flushPendingEditorDraft,
    flushPendingEditorDraftImmediately,
    registerPendingEditorDraftFlush
  };
}
