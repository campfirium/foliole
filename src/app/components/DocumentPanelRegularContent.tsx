import type { ComponentProps, ReactNode, RefObject } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import { AppSpinner } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface, renderPdfDocumentSurface } from './documentPanelPdfView';
import { LinkPanelStack } from './LinkPanelStack';
import type { LinkPanelRecord } from './linkPanelState';
import type { PdfHighlightLocator } from './pdfHighlightLocators';
import { ReadwiseBookDocumentGate } from './ReadwiseBookDocumentGate';

function renderPdfLoadingSurface(t: Translate) {
  return (
    <section aria-label={t('desktop.pdf.readerPanel')} className="workspace-region-main-document flex min-h-0 flex-1 flex-col" data-testid="pdf-document-loading-shell">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          aria-busy="true"
          aria-label={t('desktop.pdf.loading.progress')}
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

function renderPdfOrBodyShell(contentAreaRef: RefObject<HTMLDivElement | null>, pdfCache: JSX.Element, content: ReactNode, panelStack: JSX.Element) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" ref={contentAreaRef as ComponentProps<'div'>['ref']}>
      {pdfCache}
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
  t: Translate;
  trashedNodeIds: string[];
}) {
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
      ? renderPdfLoadingSurface(args.t)
      : renderDocumentBody(args.activeNodeId, args.bodyProps);
    return renderPdfOrBodyShell(args.contentAreaRef, args.pdfCache, content, panelStack);
  }

  if (args.pdfDocumentSurface.state === 'ready') {
    return renderPdfOrBodyShell(args.contentAreaRef, args.pdfCache, null, panelStack);
  }

  const content = !args.isActivePdfCachedVisible
    ? renderPdfDocumentSurface(
        args.pdfDocumentSurface,
        { editorNodeId: args.bodyProps.editorNodeId, editorNodeViewState: args.bodyProps.editorNodeViewState },
        args.pdfHighlightLocators,
        args.onCreatePdfHighlight,
        args.onPersistPdfViewState,
        args.onOpenExternalLink,
        args.t
      )
    : null;
  return renderPdfOrBodyShell(args.contentAreaRef, args.pdfCache, content, panelStack);
}
