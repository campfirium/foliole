import { X } from 'lucide-react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';

interface DocumentSourceUpdatePanelProps {
  currentContent: string;
  currentNodeId: string | null;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  panelNodeViewState?: NodeViewState;
  setPanelEditorAdapter: (adapter: EditorAdapter | null) => void;
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

function ReadOnlyDocumentBody({
  content,
  documentMaxWidth,
  editorAppearanceKey,
  editorNodeId,
  nodeViewState,
  onEditorReady
}: {
  content: string;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorNodeId: string | null;
  nodeViewState?: NodeViewState;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
}) {
  return (
    <DocumentPanelBody
      documentMaxWidth={documentMaxWidth}
      editorAppearanceKey={editorAppearanceKey}
      editorContent={content}
      editorNodeId={editorNodeId}
      editorNodeViewState={nodeViewState}
      hasAnswerSection={false}
      isDocumentResizing={false}
      onAnswerChange={() => undefined}
      onEditorChange={() => undefined}
      onEditorReady={onEditorReady}
      onRevealDocumentPosition={() => undefined}
      onRevealDocumentSelection={() => undefined}
      onResolveDocumentPositionAtViewportY={() => null}
      onResetLayout={() => undefined}
      onStartDocumentResize={() => undefined}
      readOnly
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
                <PanelColumnLabel description="Current note content." title="Current" />
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ReadOnlyDocumentBody
                    content={props.currentContent}
                    documentMaxWidth={props.documentMaxWidth}
                    editorAppearanceKey={props.editorAppearanceKey}
                    editorNodeId={props.currentNodeId}
                    nodeViewState={props.panelNodeViewState}
                    onEditorReady={props.setPanelEditorAdapter}
                  />
                </div>
              </section>
              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-bg-panel/40">
                <PanelColumnLabel description="Latest detected source content." title="Updated Source" />
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ReadOnlyDocumentBody
                    content={props.updatedContent}
                    documentMaxWidth={props.documentMaxWidth}
                    editorAppearanceKey={`${props.editorAppearanceKey}-source-update`}
                    editorNodeId={null}
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
