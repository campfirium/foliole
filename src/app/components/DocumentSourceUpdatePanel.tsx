import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

import { buildSourceUpdateDiffModel } from './sourceUpdateDiffModel';
import { SourceUpdatePanelColumns } from './SourceUpdatePanelColumns';

interface DocumentSourceUpdatePanelProps {
  currentContent: string;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  onCurrentContentChange: (content: string) => void;
  onCurrentEditorReady?: (adapter: EditorAdapter | null) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onUpdatedEditorReady?: (adapter: EditorAdapter | null) => void;
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
      measuredHeightPx: sourceEditor ? spacer.lines.reduce((total, line) => total + sourceEditor.getLineBlockHeight(line.lineNumber), 0) : undefined
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
  return (
    <AppDialog onOpenChange={props.panelProps.onOpenChange} open={props.panelProps.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 h-[min(820px,calc(100vh-88px))] w-[min(1520px,calc(100vw-72px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
        >
          <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <AppDialogTitle className="sr-only">Source update panel</AppDialogTitle>
            <header className="flex h-12 flex-none items-center justify-end border-b border-border px-4">
              <AppButton aria-label="Close source update panel" className="size-8 px-0" onClick={() => props.panelProps.onOpenChange(false)} variant="ghost">
                <X aria-hidden="true" size={15} strokeWidth={1.9} />
              </AppButton>
            </header>
            <SourceUpdatePanelColumns
              currentEditor={props.currentEditor}
              currentMeasuredHighlights={props.currentMeasuredHighlights}
              handleCurrentEditorReady={props.handleCurrentEditorReady}
              handleUpdatedEditorReady={props.handleUpdatedEditorReady}
              lineHighlights={props.lineHighlights}
              overviewSegments={props.overviewSegments}
              props={props.panelProps}
              totalRows={props.totalRows}
              updatedEditor={props.updatedEditor}
              updatedMeasuredHighlights={props.updatedMeasuredHighlights}
            />
          </section>
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
