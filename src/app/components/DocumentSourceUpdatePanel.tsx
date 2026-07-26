import { useEffect, useLayoutEffect, useState } from 'react';

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
import { useSourceUpdateDiffModel } from './useSourceUpdateDiffModel';
import { useSourceUpdatePanelLiveProps } from './useSourceUpdatePanelLiveProps';
import { useSourceUpdatePanelSnapshots } from './useSourceUpdatePanelSnapshots';

export interface DocumentSourceUpdatePanelProps {
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
  panelProps: DocumentSourceUpdatePanelProps & { updatedExternalVersion: number };
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
  const snapshots = useSourceUpdatePanelSnapshots(props);
  const {
    currentMeasuredHighlights,
    diffModel,
    lineHighlights,
    updatedMeasuredHighlights
  } = useSourceUpdateDiffModel({
    currentContent: snapshots.current,
    currentEditor,
    enabled: props.comparisonMode !== 'manual' || Boolean(snapshots.updated.trim()),
    updatedContent: snapshots.updated,
    updatedEditor
  });

  useSourceUpdatePanelScrollSync(currentEditor, updatedEditor, props.open);
  useEffect(() => {
    currentEditor?.setDiffDecorations(currentMeasuredHighlights ?? lineHighlights.current);
  }, [currentEditor, currentMeasuredHighlights, lineHighlights.current]);
  useEffect(() => {
    updatedEditor?.setDiffDecorations(updatedMeasuredHighlights ?? lineHighlights.updated);
  }, [lineHighlights.updated, updatedEditor, updatedMeasuredHighlights]);

  const handleCurrentEditorReady = (adapter: EditorAdapter | null) => {
    setCurrentEditor(adapter);
    props.onCurrentEditorReady?.(adapter);
  };

  const handleUpdatedEditorReady = (adapter: EditorAdapter | null) => {
    setUpdatedEditor(adapter);
    props.onUpdatedEditorReady?.(adapter);
  };

  const panelProps = useSourceUpdatePanelLiveProps(props, currentEditor, updatedEditor, snapshots);

  return <SourceUpdatePanelDialog
    currentEditor={currentEditor}
    currentMeasuredHighlights={currentMeasuredHighlights}
    handleCurrentEditorReady={handleCurrentEditorReady}
    handleUpdatedEditorReady={handleUpdatedEditorReady}
    lineHighlights={lineHighlights}
    overviewSegments={diffModel.overviewSegments}
    panelProps={panelProps}
    totalRows={diffModel.totalRows}
    updatedEditor={updatedEditor}
    updatedMeasuredHighlights={updatedMeasuredHighlights}
  />;
}
