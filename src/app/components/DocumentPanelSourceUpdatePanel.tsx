import type { TopicTextAlternative } from '../../../lib/core/sync/topicTextState';

import type { DocumentComparisonMode } from './documentComparisonView';
import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

interface DocumentPanelSourceUpdatePanelProps {
  currentContent: string;
  currentHighlightCount: number;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorNodeId: string | null;
  alternatives?: TopicTextAlternative[];
  selectedAlternativeId?: string | null;
  onSelectAlternative?: (id: string) => void;
  comparisonMode: DocumentComparisonMode;
  comparisonSource: 'manual' | 'source';
  manualContent: string;
  onAcceptIncomingUpdate?: () => Promise<void>;
  onCurrentContentChange: (content: string) => void;
  onDismissIncomingUpdate?: () => Promise<void>;
  onImportIncomingUpdateAsNew?: () => Promise<void>;
  onManualContentChange: (content: string) => void;
  onManualSaveAsTopic: () => Promise<void>;
  onManualSetAsBody: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onSourceChange: (source: 'manual' | 'source') => void;
  sourceAvailable: boolean;
  updatedHighlightCount: number;
  updatedContent: string;
}

export function DocumentPanelSourceUpdatePanel(props: DocumentPanelSourceUpdatePanelProps) {
  return (
    <DocumentSourceUpdatePanel
      {...(props.alternatives ? { alternatives: props.alternatives } : {})}
      {...(props.selectedAlternativeId ? { selectedAlternativeId: props.selectedAlternativeId } : {})}
      {...(props.onSelectAlternative ? { onSelectAlternative: props.onSelectAlternative } : {})}
      currentContent={props.currentContent}
      currentHighlightCount={props.currentHighlightCount}
      currentNodeId={props.editorNodeId}
      comparisonMode={props.comparisonMode}
      comparisonSource={props.comparisonSource}
      documentMaxWidth={props.documentMaxWidth}
      editorAppearanceKey={props.editorAppearanceKey}
      {...(props.onAcceptIncomingUpdate ? { onAcceptIncomingUpdate: props.onAcceptIncomingUpdate } : {})}
      onCurrentContentChange={props.onCurrentContentChange}
      {...(props.onDismissIncomingUpdate ? { onDismissIncomingUpdate: props.onDismissIncomingUpdate } : {})}
      {...(props.onImportIncomingUpdateAsNew ? { onImportIncomingUpdateAsNew: props.onImportIncomingUpdateAsNew } : {})}
      onOpenChange={props.onOpenChange}
      manualContent={props.manualContent}
      onManualContentChange={props.onManualContentChange}
      onManualSaveAsTopic={props.onManualSaveAsTopic}
      onManualSetAsBody={props.onManualSetAsBody}
      onSourceChange={props.onSourceChange}
      open={props.open}
      sourceAvailable={props.sourceAvailable}
      updatedHighlightCount={props.updatedHighlightCount}
      updatedContent={props.updatedContent}
    />
  );
}
