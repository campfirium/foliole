import type { ComponentProps } from 'react';

import type { EditorAdapter, EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { DocumentPanelBody } from './DocumentPanelBody';
import type { SourceUpdateOverviewSegment } from './sourceUpdateDiffModel';
import { SourceUpdateOverviewRuler } from './SourceUpdateOverviewRuler';
import { SourceUpdateSummaryBar } from './SourceUpdateSummaryBar';

const DOCUMENT_PREVIEW_PANE_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--workspace-region-main-document-bg)]';
const REFERENCE_PREVIEW_PANE_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-[var(--app-floating-muted-bg)]';
const REFERENCE_HEADER_SURFACE_CLASS_NAME = 'border-l border-border bg-[var(--app-floating-muted-bg)]';
const OVERVIEW_PANE_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-[var(--app-floating-muted-bg)]';

interface DocumentSourceUpdatePanelLayoutProps {
  currentContent: string;
  currentHighlightCount: number;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  onCurrentContentChange: (content: string) => void;
  updatedHighlightCount: number;
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
      editorNodeId={currentNodeId}
      hasAnswerSection={false}
      onAnswerChange={() => undefined}
      onEditorChange={onChange}
      onRevealDocumentPosition={() => undefined}
      onRevealDocumentSelection={() => undefined}
      onResolveDocumentPositionAtViewportY={() => null}
      reveal=""
      showDocumentOutline={false}
      {...definedProps({
        editorDiffDecorations,
        editorHideScrollbar: hideScrollbar,
        onEditorReady: onReady,
        readOnly
      })}
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
  const t = useTranslation();
  const currentPaneProps = buildCurrentPaneProps(props);
  const updatedPaneProps = buildUpdatedPaneProps(props);

  return (
    <>
      <SourceUpdateSummaryBar
        currentHighlightCount={props.props.currentHighlightCount}
        updatedHighlightCount={props.props.updatedHighlightCount}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <PanelColumnLabel
          description={t('desktop.sourceUpdate.current.description')}
          title={t('desktop.sourceUpdate.current.title')}
        />
        <div className={REFERENCE_HEADER_SURFACE_CLASS_NAME}>
          <PanelColumnLabel
            description={t('desktop.sourceUpdate.updated.description')}
            title={t('desktop.sourceUpdate.updated.title')}
          />
        </div>
        <div aria-hidden="true" className={`${REFERENCE_HEADER_SURFACE_CLASS_NAME} border-b`} />
        <SourceUpdatePaneBody
          className={DOCUMENT_PREVIEW_PANE_CLASS_NAME}
          paneProps={currentPaneProps}
        />
        <SourceUpdatePaneBody
          className={REFERENCE_PREVIEW_PANE_CLASS_NAME}
          paneProps={updatedPaneProps}
        />
        <section className={OVERVIEW_PANE_CLASS_NAME}>
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
    </>
  );
}
