import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';

interface SourceUpdateDraft {
  baseContent: string;
  content: string;
  nodeId: string | null;
}

function createSourceUpdateDraft(args: Pick<DocumentPanelSectionProps, 'editorContent' | 'editorNodeId'>): SourceUpdateDraft {
  return {
    baseContent: args.editorContent,
    content: args.editorContent,
    nodeId: args.editorNodeId
  };
}

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
      args.flushSourceUpdateDraft();
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
    args.isSourceUpdatePanelOpen,
    args.props,
    args.setSourceUpdateDraftContent,
    args.sourceUpdateDraftRef
  ]);
}

export function useDocumentPanelSourceUpdateState(props: DocumentPanelSectionProps) {
  const [isSourceUpdatePanelOpen, setIsSourceUpdatePanelOpen] = useState(false);
  const [sourceUpdateDraftContent, setSourceUpdateDraftContent] = useState<string | null>(null);
  const sourceUpdateDraftRef = useRef<SourceUpdateDraft | null>(null);
  const sourceUpdatePreview = useNodeSourceUpdatePreview(props.activeNodeId);

  const flushSourceUpdateDraft = useCallback(() => {
    const draft = sourceUpdateDraftRef.current;
    if (draft === null || draft.content === draft.baseContent) {
      return;
    }
    if (!draft.nodeId) {
      props.onEditorChange(draft.content);
      return;
    }
    props.onNodeContentChange(draft.nodeId, draft.content);
  }, [props.onEditorChange, props.onNodeContentChange]);

  const handleSourceUpdatePanelOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        const nextDraft = sourceUpdateDraftRef.current ?? createSourceUpdateDraft(props);
        sourceUpdateDraftRef.current = nextDraft;
        setSourceUpdateDraftContent(nextDraft.content);
        setIsSourceUpdatePanelOpen(true);
        return;
      }
      flushSourceUpdateDraft();
      sourceUpdateDraftRef.current = null;
      setSourceUpdateDraftContent(null);
      setIsSourceUpdatePanelOpen(false);
    },
    [flushSourceUpdateDraft, props.editorContent]
  );

  useSourceUpdatePreviewAutoClose({ handleSourceUpdatePanelOpenChange, isSourceUpdatePanelOpen, sourceUpdatePreview });
  useSourceUpdateDraftSync({
    flushSourceUpdateDraft,
    isSourceUpdatePanelOpen,
    props,
    setSourceUpdateDraftContent,
    sourceUpdateDraftRef
  });

  return {
    currentSourceUpdateContent: sourceUpdateDraftContent ?? props.editorContent,
    handleSourceUpdateDraftChange: (content: string) => {
      sourceUpdateDraftRef.current = {
        baseContent: sourceUpdateDraftRef.current?.baseContent ?? props.editorContent,
        content,
        nodeId: sourceUpdateDraftRef.current?.nodeId ?? props.editorNodeId
      };
      setSourceUpdateDraftContent(content);
    },
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  };
}
