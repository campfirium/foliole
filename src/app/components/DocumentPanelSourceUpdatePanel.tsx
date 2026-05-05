import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

interface DocumentPanelSourceUpdatePanelProps {
  currentContent: string;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorNodeId: string | null;
  onCurrentContentChange: (content: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  updatedContent: string;
}

export function DocumentPanelSourceUpdatePanel(props: DocumentPanelSourceUpdatePanelProps) {
  return (
    <DocumentSourceUpdatePanel
      currentContent={props.currentContent}
      currentNodeId={props.editorNodeId}
      documentMaxWidth={props.documentMaxWidth}
      editorAppearanceKey={props.editorAppearanceKey}
      onCurrentContentChange={props.onCurrentContentChange}
      onOpenChange={props.onOpenChange}
      open={props.open}
      updatedContent={props.updatedContent}
    />
  );
}
