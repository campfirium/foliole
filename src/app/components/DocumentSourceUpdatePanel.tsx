import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { getElectronAPI } from '../../shared/platform/electronApi';
import { onWindowPriorityEscape } from '../../shared/platform/keyboard';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

import { buildSourceUpdateDiffModel } from './sourceUpdateDiffModel';
import { SourceUpdatePanelDialogBody } from './SourceUpdatePanelDialogBody';

interface DocumentSourceUpdatePanelProps {
  currentContent: string;
  currentHighlightCount: number;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  onAcceptIncomingUpdate?: () => Promise<void>;
  onCurrentContentChange: (content: string) => void;
  onCurrentEditorReady?: (adapter: EditorAdapter | null) => void;
  onDismissIncomingUpdate?: () => Promise<void>;
  onImportIncomingUpdateAsNew?: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onUpdatedEditorReady?: (adapter: EditorAdapter | null) => void;
  updatedHighlightCount: number;
  updatedContent: string;
}

function useSourceUpdatePanelScrollSync(
  currentEditor: EditorAdapter | null,
  updatedEditor: EditorAdapter | null,
  open: boolean
) {
  const syncSourceRef = useRef<null | 'current' | 'updated'>(null);

  useEffect(() => {
    if (!open || !currentEditor || !updatedEditor) {
      return;
    }

    const releaseSync = () => {
      requestAnimationFrame(() => {
        syncSourceRef.current = null;
      });
    };

    const syncEditors = (source: EditorAdapter, target: EditorAdapter, sourceKey: 'current' | 'updated') => {
      if (syncSourceRef.current && syncSourceRef.current !== sourceKey) {
        return;
      }

      syncSourceRef.current = sourceKey;
      target.setScrollTop(source.getScrollTop());
      releaseSync();
    };

    updatedEditor.setScrollTop(currentEditor.getScrollTop());
    const unsubscribeCurrent = currentEditor.onScroll(() => syncEditors(currentEditor, updatedEditor, 'current'));
    const unsubscribeUpdated = updatedEditor.onScroll(() => syncEditors(updatedEditor, currentEditor, 'updated'));

    return () => {
      unsubscribeCurrent();
      unsubscribeUpdated();
      syncSourceRef.current = null;
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
  updatedEditor: EditorAdapter | null
) {
  const diffModel = useMemo(() => buildSourceUpdateDiffModel(currentContent, updatedContent), [currentContent, updatedContent]);
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
  useLayoutEffect(() => {
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
    const unlistenNativeEscape = getElectronAPI()?.onNativeKeyboardInput?.((payload) => {
      if (payload.type === 'keyDown' && payload.key === 'Escape') {
        closePanel();
      }
    }) ?? null;
    return () => {
      unlistenPriorityEscape();
      unlistenNativeEscape?.();
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
    updatedEditor
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
