import { X } from 'lucide-react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

import { DocumentPanelBody } from './DocumentPanelBody';

interface DocumentSourceUpdatePanelProps {
  currentContent: string;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  onCurrentContentChange: (content: string) => void;
  onCurrentEditorReady?: (adapter: EditorAdapter | null) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
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
  onChange,
  onReady,
  readOnly
}: {
  content: string;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
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

export function DocumentSourceUpdatePanel(props: DocumentSourceUpdatePanelProps) {
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
            <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden">
              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg-elevated">
                <PanelColumnLabel description="This side keeps the same reading and editing feel as the main document, but scrolls independently inside the panel." title="Current" />
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <PreviewDocumentPane
                    content={props.currentContent}
                    currentNodeId={props.currentNodeId}
                    documentMaxWidth={props.documentMaxWidth}
                    editorAppearanceKey={`${props.editorAppearanceKey}-source-update-current`}
                    onChange={props.onCurrentContentChange}
                    onReady={props.onCurrentEditorReady}
                  />
                </div>
              </section>
              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-bg-panel/40">
                <PanelColumnLabel description="This side uses the same document rendering, but stays read-only." title="Updated Source" />
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <PreviewDocumentPane
                    content={props.updatedContent}
                    currentNodeId={null}
                    documentMaxWidth={props.documentMaxWidth}
                    editorAppearanceKey={`${props.editorAppearanceKey}-source-update-reference`}
                    onChange={() => undefined}
                    readOnly
                  />
                </div>
              </section>
            </div>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
