import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { DocumentPanelSectionProps } from './DocumentPanelSection';

export interface SourceUpdateDraft {
  baseContent: string;
  content: string;
  nodeId: string | null;
}

export interface SourceUpdateDraftRefs {
  sourceUpdateDraftContent: string | null;
  sourceUpdateDraftRef: MutableRefObject<SourceUpdateDraft | null>;
}

export function createSourceUpdateDraft(
  args: Pick<DocumentPanelSectionProps, 'editorContent' | 'editorNodeId'>
): SourceUpdateDraft {
  return {
    baseContent: args.editorContent,
    content: args.editorContent,
    nodeId: args.editorNodeId
  };
}

export function useClearIncomingUpdateDraft(args: {
  setIsSourceUpdatePanelOpen: Dispatch<SetStateAction<boolean>>;
  setSourceUpdateDraftContent: Dispatch<SetStateAction<string | null>>;
  sourceUpdateDraftRef: MutableRefObject<SourceUpdateDraft | null>;
}) {
  return useCallback(() => {
    args.sourceUpdateDraftRef.current = null;
    args.setSourceUpdateDraftContent(null);
    args.setIsSourceUpdatePanelOpen(false);
  }, [args.setIsSourceUpdatePanelOpen, args.setSourceUpdateDraftContent, args.sourceUpdateDraftRef]);
}

export function useFlushSourceUpdateDraft(args: {
  onNodeContentChange: DocumentPanelSectionProps['onNodeContentChange'];
  sourceUpdateDraftRef: MutableRefObject<SourceUpdateDraft | null>;
}) {
  return useCallback(() => {
    const draft = args.sourceUpdateDraftRef.current;
    if (draft === null || draft.content === draft.baseContent) {
      return;
    }
    if (!draft.nodeId) {
      return;
    }
    args.onNodeContentChange(draft.nodeId, draft.content);
  }, [args.onNodeContentChange, args.sourceUpdateDraftRef]);
}
