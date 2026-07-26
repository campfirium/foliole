import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { onWindowPriorityEscape } from '../../shared/platform/keyboard';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

import type { DocumentComparisonMode } from './documentComparisonView';
import { buildSourceUpdateDiffModel } from './sourceUpdateDiffModel';
import { SourceUpdatePanelDialogBody } from './SourceUpdatePanelDialogBody';

interface DocumentSourceUpdatePanelProps {
  comparisonMode: DocumentComparisonMode;
  comparisonSource: 'manual' | 'source';
  currentContent: string;
  currentHighlightCount: number;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  manualContent: string;
  onAcceptIncomingUpdate?: () => Promise<void>;
  onCurrentContentChange: (content: string) => void;
  onCurrentEditorReady?: (adapter: EditorAdapter | null) => void;
  onDismissIncomingUpdate?: () => Promise<void>;
  onImportIncomingUpdateAsNew?: () => Promise<void>;
  onManualContentChange: (content: string) => void;
  onManualSaveAsTopic: () => Promise<void>;
  onManualSetAsBody: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onUpdatedEditorReady?: (adapter: EditorAdapter | null) => void;
  onSourceChange: (source: 'manual' | 'source') => void;
  sourceAvailable: boolean;
  updatedHighlightCount: number;
  updatedContent: string;
}

function useSourceUpdatePanelScrollSync(
  currentEditor: EditorAdapter | null,
  updatedEditor: EditorAdapter | null,
  open: boolean
) {
  useLayoutEffect(() => {
    if (!open || !currentEditor || !updatedEditor) {
      return;
    }

    const syncEditors = (source: EditorAdapter, target: EditorAdapter, userInitiated: boolean) => {
      if (!userInitiated) return;
      const nextScrollTop = source.getScrollTop();
      if (Math.abs(target.getScrollTop() - nextScrollTop) > 0.5) {
        target.setScrollTop(nextScrollTop);
      }
    };

    updatedEditor.setScrollTop(currentEditor.getScrollTop());
    const unsubscribeCurrent = currentEditor.onScroll((event) => syncEditors(currentEditor, updatedEditor, event.userInitiated));
    const unsubscribeUpdated = updatedEditor.onScroll((event) => syncEditors(updatedEditor, currentEditor, event.userInitiated));

    return () => {
      unsubscribeCurrent();
      unsubscribeUpdated();
    };
  }, [currentEditor, open, updatedEditor]);
}

function withMeasuredSpacerHeights(
  decorations: EditorDiffDecorations | null,
  sourceEditor: EditorAdapter | null
): EditorDiffDecorations | null {
  if (!decorations) {
    return null;
  }
  return {
    lineDecorations: decorations.lineDecorations,
    spacerDecorations: decorations.spacerDecorations.map((spacer) => ({
      ...spacer,
      ...(sourceEditor
        ? { measuredHeightPx: spacer.lines.reduce((total, line) => total + sourceEditor.getLineBlockHeight(line.lineNumber), 0) }
        : {})
    }))
  };
}

function useSourceUpdatePanelDiffState(
  currentContent: string,
  updatedContent: string,
  currentEditor: EditorAdapter | null,
  updatedEditor: EditorAdapter | null,
  enabled: boolean
) {
  const deferredCurrentContent = useDeferredValue(currentContent);
  const deferredUpdatedContent = useDeferredValue(enabled ? updatedContent : currentContent);
  const diffModel = useMemo(
    () => buildSourceUpdateDiffModel(deferredCurrentContent, deferredUpdatedContent),
    [deferredCurrentContent, deferredUpdatedContent]
  );
  const currentMeasuredHighlights = useMemo(
    () => withMeasuredSpacerHeights(diffModel.current.decorations, updatedEditor),
    [diffModel.current.decorations, updatedEditor]
  );
  const updatedMeasuredHighlights = useMemo(
    () => withMeasuredSpacerHeights(diffModel.updated.decorations, currentEditor),
    [currentEditor, diffModel.updated.decorations]
  );

  return {
    currentMeasuredHighlights,
    diffModel,
    lineHighlights: {
      current: diffModel.current.decorations,
      updated: diffModel.updated.decorations
    },
    updatedMeasuredHighlights
  };
}

function useSourceUpdatePanelEscape(open: boolean, onOpenChange: (open: boolean) => void) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const closePanel = () => {
      onOpenChange(false);
    };
    const unlistenPriorityEscape = onWindowPriorityEscape(() => {
      closePanel();
      return true;
    });
    return () => {
      unlistenPriorityEscape();
    };
  }, [onOpenChange, open]);
}

function SourceUpdatePanelDialog(props: {
  currentEditor: EditorAdapter | null;
  currentMeasuredHighlights: EditorDiffDecorations | null;
  handleCurrentEditorReady: (adapter: EditorAdapter | null) => void;
  handleUpdatedEditorReady: (adapter: EditorAdapter | null) => void;
  lineHighlights: {
    current: EditorDiffDecorations | null;
    updated: EditorDiffDecorations | null;
  };
  panelProps: DocumentSourceUpdatePanelProps;
  totalRows: number;
  overviewSegments: ReturnType<typeof buildSourceUpdateDiffModel>['overviewSegments'];
  updatedEditor: EditorAdapter | null;
  updatedMeasuredHighlights: EditorDiffDecorations | null;
}) {
  const t = useTranslation();
  useSourceUpdatePanelEscape(props.panelProps.open, props.panelProps.onOpenChange);

  const closePanelFromEscape = (event: { key?: string; preventDefault: () => void; stopPropagation: () => void }) => {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    props.panelProps.onOpenChange(false);
  };

  return (
    <AppDialog onOpenChange={props.panelProps.onOpenChange} open={props.panelProps.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="h-[min(900px,calc(100vh-48px))] w-[min(1680px,calc(100vw-48px))] p-0"
          onEscapeKeyDown={closePanelFromEscape}
          onKeyDownCapture={closePanelFromEscape}
        >
          <AppDialogTitle className="sr-only">{t('desktop.sourceUpdate.dialogTitle')}</AppDialogTitle>
          <SourceUpdatePanelDialogBody {...props} />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function DocumentSourceUpdatePanel(props: DocumentSourceUpdatePanelProps) {
  const [currentEditor, setCurrentEditor] = useState<EditorAdapter | null>(null);
  const [updatedEditor, setUpdatedEditor] = useState<EditorAdapter | null>(null);
  const {
    currentMeasuredHighlights,
    diffModel,
    lineHighlights,
    updatedMeasuredHighlights
  } = useSourceUpdatePanelDiffState(
    props.currentContent,
    props.updatedContent,
    currentEditor,
    updatedEditor,
    props.comparisonMode !== 'manual' || Boolean(props.manualContent.trim())
  );

  useSourceUpdatePanelScrollSync(currentEditor, updatedEditor, props.open);

  const handleCurrentEditorReady = (adapter: EditorAdapter | null) => {
    setCurrentEditor(adapter);
    props.onCurrentEditorReady?.(adapter);
  };

  const handleUpdatedEditorReady = (adapter: EditorAdapter | null) => {
    setUpdatedEditor(adapter);
    props.onUpdatedEditorReady?.(adapter);
  };

  return <SourceUpdatePanelDialog
    currentEditor={currentEditor}
    currentMeasuredHighlights={currentMeasuredHighlights}
    handleCurrentEditorReady={handleCurrentEditorReady}
    handleUpdatedEditorReady={handleUpdatedEditorReady}
    lineHighlights={lineHighlights}
    overviewSegments={diffModel.overviewSegments}
    panelProps={props}
    totalRows={diffModel.totalRows}
    updatedEditor={updatedEditor}
    updatedMeasuredHighlights={updatedMeasuredHighlights}
  />;
}
