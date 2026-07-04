import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

interface DocumentPanelSourceUpdatePanelProps {
  currentContent: string;
  currentHighlightCount: number;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorNodeId: string | null;
  onAcceptIncomingUpdate?: () => Promise<void>;
  onCurrentContentChange: (content: string) => void;
  onDismissIncomingUpdate?: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  updatedHighlightCount: number;
  updatedContent: string;
}

export function DocumentPanelSourceUpdatePanel(props: DocumentPanelSourceUpdatePanelProps) {
  return (
    <DocumentSourceUpdatePanel
      currentContent={props.currentContent}
      currentHighlightCount={props.currentHighlightCount}
      currentNodeId={props.editorNodeId}
      documentMaxWidth={props.documentMaxWidth}
      editorAppearanceKey={props.editorAppearanceKey}
      {...(props.onAcceptIncomingUpdate ? { onAcceptIncomingUpdate: props.onAcceptIncomingUpdate } : {})}
      onCurrentContentChange={props.onCurrentContentChange}
      {...(props.onDismissIncomingUpdate ? { onDismissIncomingUpdate: props.onDismissIncomingUpdate } : {})}
      onOpenChange={props.onOpenChange}
      open={props.open}
      updatedHighlightCount={props.updatedHighlightCount}
      updatedContent={props.updatedContent}
    />
  );
}
