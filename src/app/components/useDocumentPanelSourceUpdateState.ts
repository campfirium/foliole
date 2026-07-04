import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { acceptRuntimeIncomingUpdate, dismissRuntimeIncomingUpdate } from '../../shared/platform/nodeSourceRuntimeRepository';

import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import {
  createSourceUpdateDraft,
  type SourceUpdateDraft,
  type SourceUpdateDraftRefs,
  useClearIncomingUpdateDraft,
  useFlushSourceUpdateDraft
} from './sourceUpdateDraftState';
import { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';

function useSourceUpdatePreviewAutoClose(args: {
  handleSourceUpdatePanelOpenChange: (open: boolean) => void;
  isSourceUpdatePanelOpen: boolean;
  sourceUpdatePreview: ReturnType<typeof useNodeSourceUpdatePreview>;
}) {
  useEffect(() => {
    if (args.isSourceUpdatePanelOpen && !args.sourceUpdatePreview.value && !args.sourceUpdatePreview.isLoading) {
      args.handleSourceUpdatePanelOpenChange(false);
    }
  }, [args.handleSourceUpdatePanelOpenChange, args.isSourceUpdatePanelOpen, args.sourceUpdatePreview.isLoading, args.sourceUpdatePreview.value]);
}

function useSourceUpdateDraftSync(args: {
  flushSourceUpdateDraft: () => void;
  isIncomingUpdatePreview: boolean;
  isSourceUpdatePanelOpen: boolean;
  props: DocumentPanelSectionProps;
  setSourceUpdateDraftContent: Dispatch<SetStateAction<string | null>>;
  sourceUpdateDraftRef: MutableRefObject<SourceUpdateDraft | null>;
}) {
  useEffect(() => {
    if (!args.isSourceUpdatePanelOpen) {
      args.sourceUpdateDraftRef.current = null;
      args.setSourceUpdateDraftContent((current) => (current === null ? current : null));
      return;
    }
    const currentDraft = args.sourceUpdateDraftRef.current;
    if (!currentDraft || currentDraft.nodeId !== args.props.editorNodeId) {
      if (!args.isIncomingUpdatePreview) {
        args.flushSourceUpdateDraft();
      }
      args.sourceUpdateDraftRef.current = createSourceUpdateDraft(args.props);
      args.setSourceUpdateDraftContent(args.props.editorContent);
      return;
    }
    if (currentDraft.content !== currentDraft.baseContent) {
      return;
    }
    args.sourceUpdateDraftRef.current = { ...currentDraft, baseContent: args.props.editorContent, content: args.props.editorContent };
    args.setSourceUpdateDraftContent((current) => (current === args.props.editorContent ? current : args.props.editorContent));
  }, [
    args.flushSourceUpdateDraft,
    args.isIncomingUpdatePreview,
    args.isSourceUpdatePanelOpen,
    args.props,
    args.setSourceUpdateDraftContent,
    args.sourceUpdateDraftRef
  ]);
}

function useIncomingUpdateActions(args: {
  clearIncomingUpdateDraft: () => void;
  incomingUpdateId: string | null;
  props: DocumentPanelSectionProps;
  sourceUpdatePreview: ReturnType<typeof useNodeSourceUpdatePreview>;
} & SourceUpdateDraftRefs) {
  const handleIncomingUpdateAccept = useCallback(async () => {
    if (!args.incomingUpdateId) {
      return;
    }
    const draft = args.sourceUpdateDraftRef.current;
    const acceptedContent =
      draft && draft.content !== draft.baseContent
        ? draft.content
        : args.sourceUpdatePreview.value?.updatedContent ?? args.sourceUpdateDraftContent ?? args.props.editorContent;
    const result = await acceptRuntimeIncomingUpdate(args.incomingUpdateId, acceptedContent);
    if (result?.status === 'accepted' && result.nodeId) {
      args.props.onNodeContentChange(result.nodeId, acceptedContent, { publishLocal: false });
    }
    args.clearIncomingUpdateDraft();
  }, [args]);

  const handleIncomingUpdateDismiss = useCallback(async () => {
    if (!args.incomingUpdateId) {
      return;
    }
    await dismissRuntimeIncomingUpdate(args.incomingUpdateId);
    args.clearIncomingUpdateDraft();
  }, [args]);

  return {
    handleIncomingUpdateAccept: args.incomingUpdateId ? handleIncomingUpdateAccept : undefined,
    handleIncomingUpdateDismiss: args.incomingUpdateId ? handleIncomingUpdateDismiss : undefined
  };
}

function useSourceUpdatePanelOpenChange(args: {
  flushSourceUpdateDraft: () => void;
  isIncomingUpdatePreview: boolean;
  props: DocumentPanelSectionProps;
  setIsSourceUpdatePanelOpen: Dispatch<SetStateAction<boolean>>;
  setSourceUpdateDraftContent: Dispatch<SetStateAction<string | null>>;
  sourceUpdateDraftRef: MutableRefObject<SourceUpdateDraft | null>;
}) {
  return useCallback(
    (open: boolean) => {
      if (open) {
        const nextDraft = args.sourceUpdateDraftRef.current ?? createSourceUpdateDraft(args.props);
        args.sourceUpdateDraftRef.current = nextDraft;
        args.setSourceUpdateDraftContent(nextDraft.content);
        args.setIsSourceUpdatePanelOpen(true);
        return;
      }
      if (!args.isIncomingUpdatePreview) {
        args.flushSourceUpdateDraft();
      }
      args.sourceUpdateDraftRef.current = null;
      args.setSourceUpdateDraftContent(null);
      args.setIsSourceUpdatePanelOpen(false);
    },
    [args]
  );
}

function createSourceUpdateDraftChangeHandler(
  args: Pick<DocumentPanelSectionProps, 'editorContent' | 'editorNodeId'> & {
    setSourceUpdateDraftContent: Dispatch<SetStateAction<string | null>>;
    sourceUpdateDraftRef: MutableRefObject<SourceUpdateDraft | null>;
  }
) {
  return (content: string) => {
    args.sourceUpdateDraftRef.current = {
      baseContent: args.sourceUpdateDraftRef.current?.baseContent ?? args.editorContent,
      content,
      nodeId: args.sourceUpdateDraftRef.current?.nodeId ?? args.editorNodeId
    };
    args.setSourceUpdateDraftContent(content);
  };
}

export function useDocumentPanelSourceUpdateState(props: DocumentPanelSectionProps) {
  const [isSourceUpdatePanelOpen, setIsSourceUpdatePanelOpen] = useState(false);
  const [sourceUpdateDraftContent, setSourceUpdateDraftContent] = useState<string | null>(null);
  const sourceUpdateDraftRef = useRef<SourceUpdateDraft | null>(null);
  const sourceUpdatePreview = useNodeSourceUpdatePreview(props.activeNodeId);
  const incomingUpdateId = sourceUpdatePreview.value?.incomingUpdateId ?? null;
  const isIncomingUpdatePreview = sourceUpdatePreview.value?.kind === 'incoming_update' && Boolean(incomingUpdateId);

  const flushSourceUpdateDraft = useFlushSourceUpdateDraft({
    onNodeContentChange: props.onNodeContentChange,
    sourceUpdateDraftRef
  });

  const handleSourceUpdatePanelOpenChange = useSourceUpdatePanelOpenChange({
    flushSourceUpdateDraft,
    isIncomingUpdatePreview,
    props,
    setIsSourceUpdatePanelOpen,
    setSourceUpdateDraftContent,
    sourceUpdateDraftRef
  });

  const clearIncomingUpdateDraft = useClearIncomingUpdateDraft({
    setIsSourceUpdatePanelOpen,
    setSourceUpdateDraftContent,
    sourceUpdateDraftRef
  });

  const incomingUpdateActions = useIncomingUpdateActions({
    clearIncomingUpdateDraft,
    incomingUpdateId,
    props,
    sourceUpdatePreview,
    sourceUpdateDraftContent,
    sourceUpdateDraftRef
  });

  useSourceUpdatePreviewAutoClose({ handleSourceUpdatePanelOpenChange, isSourceUpdatePanelOpen, sourceUpdatePreview });
  useSourceUpdateDraftSync({
    flushSourceUpdateDraft,
    isIncomingUpdatePreview,
    isSourceUpdatePanelOpen,
    props,
    setSourceUpdateDraftContent,
    sourceUpdateDraftRef
  });

  return {
    currentSourceUpdateContent: sourceUpdateDraftContent ?? props.editorContent,
    handleSourceUpdateDraftChange: createSourceUpdateDraftChangeHandler({
      editorContent: props.editorContent,
      editorNodeId: props.editorNodeId,
      setSourceUpdateDraftContent,
      sourceUpdateDraftRef
    }),
    ...incomingUpdateActions,
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  };
}
