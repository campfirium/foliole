import { useCallback, useEffect, useRef, useState } from 'react';

import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';

export function useDocumentPanelSourceUpdateState(props: DocumentPanelSectionProps) {
  const [isSourceUpdatePanelOpen, setIsSourceUpdatePanelOpen] = useState(false);
  const [sourceUpdateDraftContent, setSourceUpdateDraftContent] = useState<string | null>(null);
  const sourceUpdateDraftRef = useRef<string | null>(null);
  const sourceUpdatePreview = useNodeSourceUpdatePreview(props.activeNodeId);

  const flushSourceUpdateDraft = useCallback(() => {
    const draft = sourceUpdateDraftRef.current;
    if (draft === null || draft === props.editorContent) {
      return;
    }
    if (!props.editorNodeId) {
      props.onEditorChange(draft);
      return;
    }
    props.onNodeContentChange(props.editorNodeId, draft);
  }, [props.editorContent, props.editorNodeId, props.onEditorChange, props.onNodeContentChange]);

  const handleSourceUpdatePanelOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        const nextDraft = sourceUpdateDraftRef.current ?? props.editorContent;
        sourceUpdateDraftRef.current = nextDraft;
        setSourceUpdateDraftContent(nextDraft);
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

  useEffect(() => {
    if (isSourceUpdatePanelOpen && !sourceUpdatePreview.value && !sourceUpdatePreview.isLoading) {
      handleSourceUpdatePanelOpenChange(false);
    }
  }, [handleSourceUpdatePanelOpenChange, isSourceUpdatePanelOpen, sourceUpdatePreview.isLoading, sourceUpdatePreview.value]);

  useEffect(() => {
    if (!isSourceUpdatePanelOpen) {
      sourceUpdateDraftRef.current = null;
      setSourceUpdateDraftContent((current) => (current === null ? current : null));
      return;
    }
    sourceUpdateDraftRef.current = props.editorContent;
    setSourceUpdateDraftContent((current) => (current === props.editorContent ? current : props.editorContent));
  }, [isSourceUpdatePanelOpen, props.editorContent, props.editorNodeId]);

  return {
    currentSourceUpdateContent: sourceUpdateDraftContent ?? props.editorContent,
    handleSourceUpdateDraftChange: (content: string) => {
      sourceUpdateDraftRef.current = content;
      setSourceUpdateDraftContent(content);
    },
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  };
}
