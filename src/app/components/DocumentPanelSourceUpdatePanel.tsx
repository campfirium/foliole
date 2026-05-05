import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

interface DocumentPanelSourceUpdatePanelProps {
  currentContent: string;
  currentHighlightCount: number;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorNodeId: string | null;
  onCurrentContentChange: (content: string) => void;
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
      onCurrentContentChange={props.onCurrentContentChange}
      onOpenChange={props.onOpenChange}
      open={props.open}
      updatedHighlightCount={props.updatedHighlightCount}
      updatedContent={props.updatedContent}
    />
  );
}
