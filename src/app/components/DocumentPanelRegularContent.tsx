import type { ComponentProps, ReactNode, RefObject } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import { AppSpinner } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface, renderPdfDocumentSurface } from './documentPanelPdfView';
import { LinkPanelStack } from './LinkPanelStack';
import type { LinkPanelRecord } from './linkPanelState';
import type { PdfHighlightLocator } from './pdfHighlightLocators';
import { ReadwiseBookDocumentGate } from './ReadwiseBookDocumentGate';
import { TrashDocumentRestoreAction } from './TrashDocumentRestoreAction';

function renderPdfLoadingSurface() {
  return (
    <section aria-label="PDF reader panel" className="workspace-region-main-document flex min-h-0 flex-1 flex-col" data-testid="pdf-document-loading-shell">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          aria-busy="true"
          aria-label="PDF reader progress"
          className="workspace-region-main-document pointer-events-none absolute inset-0 z-workspace-overlay flex items-center justify-center"
          role="status"
        >
          <AppSpinner decorative size="lg" />
        </div>
      </div>
    </section>
  );
}

function renderDocumentBody(activeNodeId: string | null, bodyProps: ComponentProps<typeof DocumentPanelBody>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="document-panel-content-body">
      <ReadwiseBookDocumentGate activeContent={bodyProps.editorContent} activeNodeId={activeNodeId}>
        <DocumentPanelBody {...bodyProps} />
      </ReadwiseBookDocumentGate>
    </div>
  );
}

function renderPdfOrBodyShell(contentAreaRef: RefObject<HTMLDivElement | null>, pdfCache: JSX.Element, action: ReactNode, content: ReactNode, panelStack: JSX.Element) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" ref={contentAreaRef as ComponentProps<'div'>['ref']}>
      {pdfCache}
      {action}
      {content}
      {panelStack}
    </div>
  );
}

export function renderPdfOrBodyContent(args: {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  contentAreaRef: RefObject<HTMLDivElement | null>;
  isActivePdfCachedVisible: boolean;
  isTrashViewOpen: boolean;
  linkPanels: LinkPanelRecord[];
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onCloseExternalLink: (panelId: string) => void;
  onLinkPanelStateChange: (panelId: string, state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>) => void;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onSelectNode: (nodeId: string) => void;
  pdfCache: JSX.Element;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  pdfHighlightLocators: PdfHighlightLocator[];
  shouldHideEditorBodyDuringSourceLoad: boolean;
  trashedNodeIds: string[];
}) {
  const action = (
    <TrashDocumentRestoreAction
      activeNodeId={args.activeNodeId}
      isTrashViewOpen={args.isTrashViewOpen}
      onSelectNode={args.onSelectNode}
      trashedNodeIds={args.trashedNodeIds}
    />
  );
  const panelStack = (
    <LinkPanelStack
      anchorRootRef={args.contentAreaRef}
      onClose={args.onCloseExternalLink}
      onStateChange={args.onLinkPanelStateChange}
      panels={args.linkPanels}
    />
  );

  if (!args.pdfDocumentSurface) {
    const content = args.shouldHideEditorBodyDuringSourceLoad
      ? renderPdfLoadingSurface()
      : renderDocumentBody(args.activeNodeId, args.bodyProps);
    return renderPdfOrBodyShell(args.contentAreaRef, args.pdfCache, action, content, panelStack);
  }

  if (args.pdfDocumentSurface.state === 'ready') {
    return renderPdfOrBodyShell(args.contentAreaRef, args.pdfCache, action, null, panelStack);
  }

  const content = !args.isActivePdfCachedVisible
    ? renderPdfDocumentSurface(
        args.pdfDocumentSurface,
        { editorNodeId: args.bodyProps.editorNodeId, editorNodeViewState: args.bodyProps.editorNodeViewState },
        args.pdfHighlightLocators,
        args.onCreatePdfHighlight,
        args.onPersistPdfViewState,
        args.onOpenExternalLink
      )
    : null;
  return renderPdfOrBodyShell(args.contentAreaRef, args.pdfCache, action, content, panelStack);
}
