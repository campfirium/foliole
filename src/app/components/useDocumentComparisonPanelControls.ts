import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { DocumentComparisonMode, DocumentComparisonSource } from './documentComparisonView';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import { persistManualComparisonDraft, restoreManualComparisonDraft } from './manualComparisonDraftRestore';
import { createSourceUpdateDraft, type SourceUpdateDraft } from './sourceUpdateDraftState';
import type { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';

export type ComparisonSource = 'manual' | 'source';

function restoreDraftOnOpen(args: {
  applyContent: (content: string) => void;
  nodeId: string | null;
  restoreToken: number;
  restoreTokenRef: MutableRefObject<number>;
}) {
  restoreManualComparisonDraft(args);
}

function restoreDraftOnManualSource(args: {
  applyContent: (content: string) => void;
  contentRef: MutableRefObject<string>;
  nodeId: string | null;
  restoreTokenRef: MutableRefObject<number>;
}) {
  restoreManualComparisonDraft({
    ...args,
    requireEmpty: true,
    restoreToken: args.restoreTokenRef.current
  });
}

interface DocumentComparisonPanelControlArgs {
  canOpen: boolean;
  draftRef: MutableRefObject<SourceUpdateDraft | null>;
  flushLeftDraft: () => void;
  handleManualContentChange: (content: string) => void;
  manualContentRef: MutableRefObject<string>;
  manualPersistenceSuppressedRef: MutableRefObject<boolean>;
  manualRestoreTokenRef: MutableRefObject<number>;
  modeRef: MutableRefObject<DocumentComparisonMode>;
  preview: ReturnType<typeof useNodeSourceUpdatePreview>;
  props: DocumentPanelSectionProps;
  resetManualContent: () => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setLeftContent: Dispatch<SetStateAction<string | null>>;
  setSource: Dispatch<SetStateAction<ComparisonSource>>;
}

function useDocumentComparisonPanelOpenControls(args: DocumentComparisonPanelControlArgs) {
  const clearPanel = useCallback(() => {
    args.manualRestoreTokenRef.current += 1;
    args.draftRef.current = null;
    args.setLeftContent(null);
    args.resetManualContent();
    args.setSource('manual');
    args.setIsOpen(false);
  }, [args]);

  const closePanel = useCallback(() => {
    if (args.modeRef.current === 'manual' || args.modeRef.current === 'source_preview') args.flushLeftDraft();
    clearPanel();
  }, [args, clearPanel]);

  const openPanel = useCallback((requestedSource?: DocumentComparisonSource) => {
    if (!args.canOpen) return;
    const restoreToken = args.manualRestoreTokenRef.current + 1;
    args.manualRestoreTokenRef.current = restoreToken;
    const draft = createSourceUpdateDraft(args.props);
    args.draftRef.current = draft;
    args.setLeftContent(draft.content);
    args.resetManualContent();
    args.manualPersistenceSuppressedRef.current = false;
    const nextSource = requestedSource === 'source' && args.preview.value ? 'source' : 'manual';
    args.setSource(nextSource);
    args.setIsOpen(true);
    if (nextSource === 'manual') {
      restoreDraftOnOpen({
        applyContent: args.handleManualContentChange,
        nodeId: args.props.editorNodeId,
        restoreToken,
        restoreTokenRef: args.manualRestoreTokenRef
      });
    }
  }, [args]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) openPanel();
    else closePanel();
  }, [closePanel, openPanel]);

  return { clearPanel, closePanel, handleOpenChange, openPanel };
}

function useManualComparisonPanelControls(args: DocumentComparisonPanelControlArgs) {
  const handleManualContentChange = useCallback((content: string) => {
    args.handleManualContentChange(content);
    if (args.manualPersistenceSuppressedRef.current) return;
    persistManualComparisonDraft(args.props.editorNodeId, content);
  }, [args]);

  const handleSourceChange = useCallback((nextSource: ComparisonSource) => {
    args.setSource(nextSource);
    if (nextSource !== 'manual' || args.manualContentRef.current) return;
    restoreDraftOnManualSource({
      applyContent: args.handleManualContentChange,
      contentRef: args.manualContentRef,
      nodeId: args.props.editorNodeId,
      restoreTokenRef: args.manualRestoreTokenRef
    });
  }, [args]);

  return { handleManualContentChange, handleSourceChange };
}

export function useDocumentComparisonPanelControls(args: DocumentComparisonPanelControlArgs) {
  return {
    ...useDocumentComparisonPanelOpenControls(args),
    ...useManualComparisonPanelControls(args)
  };
}
