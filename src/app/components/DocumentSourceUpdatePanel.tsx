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

import { DocumentPanelBody } from './DocumentPanelBody';
import { buildSourceUpdateDiffModel } from './sourceUpdateDiffModel';

interface SourceUpdateLineHighlights {
  current: EditorDiffDecorations | null;
  updated: EditorDiffDecorations | null;
}

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

function PanelColumnLabel({ description, title }: { description: string; title: string }) {
  return (
    <header className="flex flex-none flex-col gap-1 border-b border-border px-4 py-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-foreground/55">{description}</p>
    </header>
  );
}

function PreviewDocumentPane({
  content,
  currentNodeId,
  documentMaxWidth,
  editorAppearanceKey,
  editorDiffDecorations,
  onChange,
  onReady,
  readOnly
}: {
  content: string;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorDiffDecorations?: EditorDiffDecorations | null;
  onChange: (content: string) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  readOnly?: boolean;
}) {
  return (
    <DocumentPanelBody
      documentMaxWidth={documentMaxWidth}
      editorAppearanceKey={editorAppearanceKey}
      editorContent={content}
      editorDiffDecorations={editorDiffDecorations}
      editorNodeId={currentNodeId}
      hasAnswerSection={false}
      isDocumentResizing={false}
      onAnswerChange={() => undefined}
      onEditorChange={onChange}
      onEditorReady={onReady}
      onRevealDocumentPosition={() => undefined}
      onRevealDocumentSelection={() => undefined}
      onResolveDocumentPositionAtViewportY={() => null}
      onResetLayout={() => undefined}
      onStartDocumentResize={() => undefined}
      readOnly={readOnly}
      reveal=""
      showDocumentOutline={false}
      showDocumentResizeHandles={false}
    />
  );
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

function buildSourceUpdateLineHighlights(currentContent: string, updatedContent: string): SourceUpdateLineHighlights {
  const diffModel = buildSourceUpdateDiffModel(currentContent, updatedContent);
  return {
    current: diffModel.current.decorations,
    updated: diffModel.updated.decorations
  };
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

function SourceUpdatePanelColumns({
  lineHighlights,
  currentMeasuredHighlights,
  updatedMeasuredHighlights,
  handleCurrentEditorReady,
  handleUpdatedEditorReady,
  props
}: {
  lineHighlights: SourceUpdateLineHighlights;
  currentMeasuredHighlights: EditorDiffDecorations | null;
  updatedMeasuredHighlights: EditorDiffDecorations | null;
  handleCurrentEditorReady: (adapter: EditorAdapter | null) => void;
  handleUpdatedEditorReady: (adapter: EditorAdapter | null) => void;
  props: DocumentSourceUpdatePanelProps;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg-elevated">
        <PanelColumnLabel description="This side keeps the same reading and editing feel as the main document, stays vertically synced with the updated source, and leaves aligned gaps where the source has extra lines." title="Current" />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <PreviewDocumentPane
            content={props.currentContent}
            currentNodeId={props.currentNodeId}
            documentMaxWidth={props.documentMaxWidth}
            editorAppearanceKey={`${props.editorAppearanceKey}-source-update-current`}
            editorDiffDecorations={currentMeasuredHighlights ?? lineHighlights.current}
            onChange={props.onCurrentContentChange}
            onReady={handleCurrentEditorReady}
          />
        </div>
      </section>
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-bg-panel/40">
        <PanelColumnLabel description="This side uses the same document rendering, stays read-only, follows the current draft while you scroll, and leaves aligned gaps where the draft has extra lines." title="Updated Source" />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <PreviewDocumentPane
            content={props.updatedContent}
            currentNodeId={null}
            documentMaxWidth={props.documentMaxWidth}
            editorAppearanceKey={`${props.editorAppearanceKey}-source-update-reference`}
            editorDiffDecorations={updatedMeasuredHighlights ?? lineHighlights.updated}
            onChange={() => undefined}
            onReady={handleUpdatedEditorReady}
            readOnly
          />
        </div>
      </section>
    </div>
  );
}

export function DocumentSourceUpdatePanel(props: DocumentSourceUpdatePanelProps) {
  const [currentEditor, setCurrentEditor] = useState<EditorAdapter | null>(null);
  const [updatedEditor, setUpdatedEditor] = useState<EditorAdapter | null>(null);
  const lineHighlights = useMemo(() => buildSourceUpdateLineHighlights(props.currentContent, props.updatedContent), [
    props.currentContent,
    props.updatedContent
  ]);
  const currentMeasuredHighlights = useMemo(
    () => withMeasuredSpacerHeights(lineHighlights.current, updatedEditor),
    [lineHighlights.current, updatedEditor]
  );
  const updatedMeasuredHighlights = useMemo(
    () => withMeasuredSpacerHeights(lineHighlights.updated, currentEditor),
    [currentEditor, lineHighlights.updated]
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

  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 h-[min(820px,calc(100vh-88px))] w-[min(1520px,calc(100vw-72px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
        >
          <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <AppDialogTitle className="sr-only">Source update panel</AppDialogTitle>
            <header className="flex h-12 flex-none items-center justify-end border-b border-border px-4">
              <AppButton aria-label="Close source update panel" className="size-8 px-0" onClick={() => props.onOpenChange(false)} variant="ghost">
                <X aria-hidden="true" size={15} strokeWidth={1.9} />
              </AppButton>
            </header>
            <SourceUpdatePanelColumns
              lineHighlights={lineHighlights}
              currentMeasuredHighlights={currentMeasuredHighlights}
              updatedMeasuredHighlights={updatedMeasuredHighlights}
              handleCurrentEditorReady={handleCurrentEditorReady}
              handleUpdatedEditorReady={handleUpdatedEditorReady}
              props={props}
            />
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
