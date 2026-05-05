import type { ComponentProps } from 'react';

import type { EditorAdapter, EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';

import { DocumentPanelBody } from './DocumentPanelBody';
import type { SourceUpdateOverviewSegment } from './sourceUpdateDiffModel';
import { SourceUpdateOverviewRuler } from './SourceUpdateOverviewRuler';

interface DocumentSourceUpdatePanelLayoutProps {
  currentContent: string;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  onCurrentContentChange: (content: string) => void;
  updatedContent: string;
}

interface SourceUpdateLineHighlights {
  current: EditorDiffDecorations | null;
  updated: EditorDiffDecorations | null;
}

interface SourceUpdatePanelColumnsProps {
  currentEditor: EditorAdapter | null;
  currentMeasuredHighlights: EditorDiffDecorations | null;
  handleCurrentEditorReady: (adapter: EditorAdapter | null) => void;
  handleUpdatedEditorReady: (adapter: EditorAdapter | null) => void;
  lineHighlights: SourceUpdateLineHighlights;
  overviewSegments: SourceUpdateOverviewSegment[];
  props: DocumentSourceUpdatePanelLayoutProps;
  totalRows: number;
  updatedEditor: EditorAdapter | null;
  updatedMeasuredHighlights: EditorDiffDecorations | null;
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
  hideScrollbar,
  onChange,
  onReady,
  readOnly
}: {
  content: string;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorDiffDecorations?: EditorDiffDecorations | null;
  hideScrollbar?: boolean;
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
      editorHideScrollbar={hideScrollbar}
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

function SourceUpdatePaneBody(props: {
  className: string;
  paneProps: ComponentProps<typeof PreviewDocumentPane>;
}) {
  return (
    <section className={props.className}>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PreviewDocumentPane {...props.paneProps} />
      </div>
    </section>
  );
}

function buildCurrentPaneProps(props: SourceUpdatePanelColumnsProps): ComponentProps<typeof PreviewDocumentPane> {
  return {
    content: props.props.currentContent,
    currentNodeId: props.props.currentNodeId,
    documentMaxWidth: props.props.documentMaxWidth,
    editorAppearanceKey: `${props.props.editorAppearanceKey}-source-update-current`,
    editorDiffDecorations: props.currentMeasuredHighlights ?? props.lineHighlights.current,
    hideScrollbar: true,
    onChange: props.props.onCurrentContentChange,
    onReady: props.handleCurrentEditorReady
  };
}

function buildUpdatedPaneProps(props: SourceUpdatePanelColumnsProps): ComponentProps<typeof PreviewDocumentPane> {
  return {
    content: props.props.updatedContent,
    currentNodeId: null,
    documentMaxWidth: props.props.documentMaxWidth,
    editorAppearanceKey: `${props.props.editorAppearanceKey}-source-update-reference`,
    editorDiffDecorations: props.updatedMeasuredHighlights ?? props.lineHighlights.updated,
    onChange: () => undefined,
    onReady: props.handleUpdatedEditorReady,
    readOnly: true
  };
}

export function SourceUpdatePanelColumns(props: SourceUpdatePanelColumnsProps) {
  const currentPaneProps = buildCurrentPaneProps(props);
  const updatedPaneProps = buildUpdatedPaneProps(props);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <PanelColumnLabel
        description="This side keeps the same reading and editing feel as the main document, stays vertically synced with the updated source, and leaves aligned gaps where the source has extra lines."
        title="Current"
      />
      <div className="border-l border-border bg-bg-panel/40">
        <PanelColumnLabel
        description="This side uses the same document rendering, stays read-only, follows the current draft while you scroll, and leaves aligned gaps where the draft has extra lines."
        title="Updated Source"
        />
      </div>
      <div aria-hidden="true" className="border-b border-l border-border bg-bg-panel/40" />
      <SourceUpdatePaneBody
        className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg-elevated"
        paneProps={currentPaneProps}
      />
      <SourceUpdatePaneBody
        className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-bg-panel/40"
        paneProps={updatedPaneProps}
      />
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-bg-panel/40">
        <SourceUpdateOverviewRuler
          currentContent={props.props.currentContent}
          currentEditor={props.currentEditor}
          overviewSegments={props.overviewSegments}
          totalRows={props.totalRows}
          updatedContent={props.props.updatedContent}
          updatedEditor={props.updatedEditor}
        />
      </section>
    </div>
  );
}
