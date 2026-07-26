import type { EditorAdapter, EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';

import type { DocumentComparisonMode } from './documentComparisonView';
import type { buildSourceUpdateDiffModel } from './sourceUpdateDiffModel';
import { SourceUpdatePanelActionBar } from './SourceUpdatePanelActionBar';
import { SourceUpdatePanelColumns } from './SourceUpdatePanelColumns';
import { SourceUpdatePanelHeader } from './SourceUpdatePanelHeader';

interface SourceUpdatePanelDialogBodyProps {
  currentEditor: EditorAdapter | null;
  currentMeasuredHighlights: EditorDiffDecorations | null;
  handleCurrentEditorReady: (adapter: EditorAdapter | null) => void;
  handleUpdatedEditorReady: (adapter: EditorAdapter | null) => void;
  lineHighlights: {
    current: EditorDiffDecorations | null;
    updated: EditorDiffDecorations | null;
  };
  panelProps: {
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
    onDismissIncomingUpdate?: () => Promise<void>;
    onImportIncomingUpdateAsNew?: () => Promise<void>;
    onManualContentChange: (content: string) => void;
    onManualSaveAsTopic: () => Promise<void>;
    onManualSetAsBody: () => Promise<void>;
    onSourceChange: (source: 'manual' | 'source') => void;
    sourceAvailable: boolean;
    updatedHighlightCount: number;
    updatedContent: string;
  };
  totalRows: number;
  overviewSegments: ReturnType<typeof buildSourceUpdateDiffModel>['overviewSegments'];
  updatedEditor: EditorAdapter | null;
  updatedMeasuredHighlights: EditorDiffDecorations | null;
}

export function SourceUpdatePanelDialogBody(props: SourceUpdatePanelDialogBodyProps) {
  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <SourceUpdatePanelHeader
        comparisonMode={props.panelProps.comparisonMode}
        comparisonSource={props.panelProps.comparisonSource}
        onSourceChange={props.panelProps.onSourceChange}
        sourceAvailable={props.panelProps.sourceAvailable}
      />
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
      <SourceUpdatePanelActionBar
        comparisonMode={props.panelProps.comparisonMode}
        manualContent={props.panelProps.manualContent}
        {...(props.panelProps.onAcceptIncomingUpdate
          ? { onAcceptIncomingUpdate: props.panelProps.onAcceptIncomingUpdate }
          : {})}
        {...(props.panelProps.onDismissIncomingUpdate
          ? { onDismissIncomingUpdate: props.panelProps.onDismissIncomingUpdate }
          : {})}
        {...(props.panelProps.onImportIncomingUpdateAsNew
          ? { onImportIncomingUpdateAsNew: props.panelProps.onImportIncomingUpdateAsNew }
          : {})}
        onManualSaveAsTopic={props.panelProps.onManualSaveAsTopic}
        onManualSetAsBody={props.panelProps.onManualSetAsBody}
      />
    </section>
  );
}
