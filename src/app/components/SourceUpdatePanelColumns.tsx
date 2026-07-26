import { memo, useRef, type ComponentProps } from 'react';

import type { EditorAdapter, EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { DocumentComparisonMode } from './documentComparisonView';
import { DocumentPanelBody } from './DocumentPanelBody';
import type { SourceUpdateOverviewSegment } from './sourceUpdateDiffModel';
import { SourceUpdateOverviewRuler } from './SourceUpdateOverviewRuler';

const DOCUMENT_PREVIEW_PANE_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--workspace-region-main-document-bg)]';
const REFERENCE_PREVIEW_PANE_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-foreground/[0.10] bg-[var(--workspace-region-main-document-bg)]';
const OVERVIEW_PANE_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--workspace-region-main-document-bg)]';

interface DocumentSourceUpdatePanelLayoutProps {
  comparisonMode: DocumentComparisonMode;
  currentContent: string;
  currentHighlightCount: number;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  onCurrentContentChange: (content: string) => void;
  onManualContentChange: (content: string) => void;
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

function PaneLabel({ mode, title }: { mode: string; title: string }) {
  return (
    <div className="flex h-8 flex-none items-center gap-1.5 pl-[calc(1rem+var(--document-content-inline-padding))] pr-4 pt-1 text-[11px] font-medium text-foreground/45">
      <span>{title}</span>
      <span aria-hidden="true" className="text-foreground/25">·</span>
      <span className="text-foreground/35">{mode}</span>
    </div>
  );
}

interface PreviewDocumentPaneProps {
  content: string;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorDiffDecorations?: EditorDiffDecorations | null;
  hideScrollbar?: boolean;
  onChange: (content: string) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  readOnly?: boolean;
}

function PreviewDocumentPaneSurface({
  content,
  currentNodeId,
  documentMaxWidth,
  editorAppearanceKey,
  editorDiffDecorations,
  hideScrollbar,
  onChange,
  onReady,
  readOnly
}: PreviewDocumentPaneProps) {
  const initialContentRef = useRef(content);
  return (
    <DocumentPanelBody
      documentMaxWidth={documentMaxWidth}
      editorAppearanceKey={editorAppearanceKey}
      editorContent={initialContentRef.current}
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

const PreviewDocumentPane = memo(
  PreviewDocumentPaneSurface,
  (previous, next) => previous.currentNodeId === next.currentNodeId
    && previous.documentMaxWidth === next.documentMaxWidth
    && previous.editorAppearanceKey === next.editorAppearanceKey
    && previous.hideScrollbar === next.hideScrollbar
    && previous.readOnly === next.readOnly
    && (!next.readOnly || previous.content === next.content)
);

function SourceUpdatePaneBody(props: {
  className: string;
  labelMode: string;
  labelTitle: string;
  paneProps: ComponentProps<typeof PreviewDocumentPane>;
}) {
  return (
    <section className={props.className}>
      <PaneLabel mode={props.labelMode} title={props.labelTitle} />
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
  const isManual = props.props.comparisonMode === 'manual';
  return {
    content: props.props.updatedContent,
    currentNodeId: null,
    documentMaxWidth: props.props.documentMaxWidth,
    editorAppearanceKey: `${props.props.editorAppearanceKey}-source-update-reference`,
    editorDiffDecorations: props.updatedMeasuredHighlights ?? props.lineHighlights.updated,
    onChange: isManual ? props.props.onManualContentChange : () => undefined,
    onReady: props.handleUpdatedEditorReady,
    readOnly: !isManual
  };
}

export function SourceUpdatePanelColumns(props: SourceUpdatePanelColumnsProps) {
  const t = useTranslation();
  const currentPaneProps = buildCurrentPaneProps(props);
  const updatedPaneProps = buildUpdatedPaneProps(props);

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem] overflow-hidden">
        <SourceUpdatePaneBody
          className={DOCUMENT_PREVIEW_PANE_CLASS_NAME}
          labelMode={t('desktop.sourceUpdate.current.mode')}
          labelTitle={t('desktop.sourceUpdate.current.title')}
          paneProps={currentPaneProps}
        />
        <SourceUpdatePaneBody
          key={`updated-${props.props.comparisonMode}`}
          className={REFERENCE_PREVIEW_PANE_CLASS_NAME}
          labelMode={t(props.props.comparisonMode === 'manual'
            ? 'desktop.sourceUpdate.manual.mode'
            : 'desktop.sourceUpdate.updated.mode')}
          labelTitle={t(props.props.comparisonMode === 'manual'
            ? 'desktop.sourceUpdate.manual.title'
            : 'desktop.sourceUpdate.updated.title')}
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
