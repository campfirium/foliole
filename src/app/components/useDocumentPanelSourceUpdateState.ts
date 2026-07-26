import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';

import type { RuntimeNodeSourceUpdatePreview } from '../../shared/platform/nodeSourceRuntimeRepository';

import {
  canOpenDocumentComparisonView,
  DOCUMENT_COMPARISON_VIEW_TOGGLE_EVENT,
  type DocumentComparisonMode,
  type DocumentComparisonSource
} from './documentComparisonView';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import {
  createSourceUpdateDraft,
  type SourceUpdateDraft,
  useFlushSourceUpdateDraft
} from './sourceUpdateDraftState';
import { useDocumentComparisonSourceActions } from './useDocumentComparisonSourceActions';
import { useDocumentManualComparisonActions } from './useDocumentManualComparisonActions';
import { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';

type ComparisonSource = 'manual' | 'source';

function resolveMode(source: ComparisonSource, preview: RuntimeNodeSourceUpdatePreview | null): DocumentComparisonMode {
  if (source === 'manual' || !preview) return 'manual';
  return preview.kind === 'source_update' ? 'source_preview' : preview.kind;
}

function useComparisonEligibility(props: DocumentPanelSectionProps) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  return canOpenDocumentComparisonView({
    activeNode,
    activeNodeId: props.activeNodeId,
    editorNodeId: props.editorNodeId,
    isEditorReadOnly: props.isEditorReadOnly,
    isExternalViewOpen: false,
    isFoliolePublishedContext: Boolean(props.isFoliolePublishedContext),
    isImmersiveMode: Boolean(props.isImmersiveMode),
    isReviewOnly: Boolean(props.reviewEscapeBlurEnabled && !props.reviewCaretLineHighlight),
    isTrashViewOpen: Boolean(props.isTrashViewOpen)
  });
}

function createDraftChangeHandler(
  props: DocumentPanelSectionProps,
  draftRef: MutableRefObject<SourceUpdateDraft | null>,
  setContent: Dispatch<SetStateAction<string | null>>
) {
  return (content: string) => {
    draftRef.current = {
      baseContent: draftRef.current?.baseContent ?? props.editorContent,
      content,
      nodeId: draftRef.current?.nodeId ?? props.editorNodeId
    };
    setContent(content);
  };
}

function useComparisonLifecycle(args: {
  closePanel: () => void;
  draftRef: MutableRefObject<SourceUpdateDraft | null>;
  flushLeftDraft: () => void;
  isOpen: boolean;
  modeRef: MutableRefObject<DocumentComparisonMode>;
  openPanel: (source?: DocumentComparisonSource) => void;
  openRef: MutableRefObject<boolean>;
  preview: ReturnType<typeof useNodeSourceUpdatePreview>;
  editorNodeId: string | null;
  source: ComparisonSource;
}) {
  useEffect(() => {
    const toggle = (event: Event) => {
      const requestedSource = (event as CustomEvent<{ source?: DocumentComparisonSource }>).detail?.source;
      if (args.openRef.current) args.closePanel();
      else args.openPanel(requestedSource);
    };
    window.addEventListener(DOCUMENT_COMPARISON_VIEW_TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(DOCUMENT_COMPARISON_VIEW_TOGGLE_EVENT, toggle);
  }, [args.closePanel, args.openPanel, args.openRef]);
  useEffect(() => {
    if (args.isOpen && args.draftRef.current?.nodeId !== args.editorNodeId) args.closePanel();
  }, [args.closePanel, args.draftRef, args.editorNodeId, args.isOpen]);
  useEffect(() => {
    if (args.isOpen && args.source === 'source' && !args.preview.isLoading && !args.preview.value) args.closePanel();
  }, [args.closePanel, args.isOpen, args.preview.isLoading, args.preview.value, args.source]);
  useEffect(() => () => {
    if (args.modeRef.current === 'manual' || args.modeRef.current === 'source_preview') args.flushLeftDraft();
  }, [args.flushLeftDraft, args.modeRef]);
}

function useComparisonBehavior(args: {
  clearPanel: () => void;
  closePanel: () => void;
  draftRef: MutableRefObject<SourceUpdateDraft | null>;
  flushLeftDraft: () => void;
  isOpen: boolean;
  leftContent: string | null;
  manualContentRef: MutableRefObject<string>;
  modeRef: MutableRefObject<DocumentComparisonMode>;
  openPanel: () => void;
  openRef: MutableRefObject<boolean>;
  preview: ReturnType<typeof useNodeSourceUpdatePreview>;
  props: DocumentPanelSectionProps;
  source: ComparisonSource;
}) {
  useComparisonLifecycle({ ...args, editorNodeId: args.props.editorNodeId });
  const sourceActions = useDocumentComparisonSourceActions({
    clearPanel: args.clearPanel,
    props: args.props,
    sourceUpdateDraftContent: args.leftContent,
    sourceUpdateDraftRef: args.draftRef,
    sourceUpdatePreview: args.preview
  });
  const manualActions = useDocumentManualComparisonActions({
    clearPanel: args.clearPanel,
    draftRef: args.draftRef,
    flushLeftDraft: args.flushLeftDraft,
    manualContentRef: args.manualContentRef,
    props: args.props
  });
  return { manualActions, sourceActions };
}

function useManualComparisonContent() {
  const [content, setContent] = useState('');
  const contentRef = useRef('');
  const reset = useCallback(() => {
    contentRef.current = '';
    setContent('');
  }, []);
  const update = useCallback((nextContent: string) => {
    contentRef.current = nextContent;
    setContent(nextContent);
  }, []);
  return { content, contentRef, reset, update };
}

export function useDocumentPanelSourceUpdateState(props: DocumentPanelSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [leftContent, setLeftContent] = useState<string | null>(null);
  const { content: manualContent, contentRef: manualContentRef, reset: resetManualContent,
    update: handleManualContentChange } = useManualComparisonContent();
  const [source, setSource] = useState<ComparisonSource>('manual');
  const draftRef = useRef<SourceUpdateDraft | null>(null);
  const openRef = useRef(false);
  const preview = useNodeSourceUpdatePreview(props.activeNodeId);
  const canOpen = useComparisonEligibility(props);
  const mode = resolveMode(source, preview.value);
  const modeRef = useRef<DocumentComparisonMode>(mode);
  modeRef.current = mode;
  openRef.current = isOpen;
  const flushLeftDraft = useFlushSourceUpdateDraft({ onNodeContentChange: props.onNodeContentChange, sourceUpdateDraftRef: draftRef });

  const clearPanel = useCallback(() => {
    draftRef.current = null;
    setLeftContent(null);
    resetManualContent();
    setSource('manual');
    setIsOpen(false);
  }, [resetManualContent]);

  const closePanel = useCallback(() => {
    if (modeRef.current === 'manual' || modeRef.current === 'source_preview') flushLeftDraft();
    clearPanel();
  }, [clearPanel, flushLeftDraft]);

  const openPanel = useCallback((requestedSource?: DocumentComparisonSource) => {
    if (!canOpen) return;
    const draft = createSourceUpdateDraft(props);
    draftRef.current = draft;
    setLeftContent(draft.content);
    resetManualContent();
    setSource(requestedSource === 'source' && preview.value ? 'source' : 'manual');
    setIsOpen(true);
  }, [canOpen, preview.value, props, resetManualContent]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) openPanel();
    else closePanel();
  }, [closePanel, openPanel]);

  const { manualActions, sourceActions } = useComparisonBehavior({
    clearPanel, closePanel, draftRef, flushLeftDraft, isOpen, leftContent, manualContentRef,
    modeRef, openPanel, openRef, preview, props, source
  });

  return {
    canOpenComparisonView: canOpen,
    comparisonMode: mode,
    comparisonSource: source,
    currentSourceUpdateContent: leftContent ?? props.editorContent,
    handleManualContentChange,
    handleManualSaveAsTopic: manualActions.saveAsTopic,
    handleManualSetAsBody: manualActions.setAsBody,
    handleSourceUpdateDraftChange: createDraftChangeHandler(props, draftRef, setLeftContent),
    handleSourceUpdatePanelOpenChange: handleOpenChange,
    isSourceUpdatePanelOpen: isOpen,
    manualContent,
    setComparisonSource: setSource,
    sourceUpdatePreview: preview,
    ...sourceActions
  };
}
