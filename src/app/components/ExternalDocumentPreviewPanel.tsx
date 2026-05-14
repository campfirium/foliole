import { Maximize2, Minimize2, X } from 'lucide-react';
import { useRef } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { ExternalDocumentImportResult } from '../../shared/platform/externalDocumentImportRepository';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import { AppButton, AppErrorState, AppIconButton, AppLoadingState, appFloatingSurfaceClassName } from '../../shared/ui';

import { useOpenImportedExternalDocument } from './externalDocumentImportState';
import { useExternalDocumentPreviewPanelFrame } from './externalDocumentPreviewPanelState';
import type { ExternalDocumentPreviewRequest } from './externalDocumentPreviewState';
import { useExternalSearchPreviewDocument } from './externalSearchPreviewState';
import { LinkPanelStack } from './LinkPanelStack';
import { useExternalLinkPanels } from './useExternalLinkPanels';

interface ExternalDocumentPreviewPanelProps {
  onClose: () => void;
  onOpenImportedNode: (result: ExternalDocumentImportResult) => void;
  onOpenInExternalLibrary: (request: ExternalDocumentPreviewRequest) => void;
  request: ExternalDocumentPreviewRequest | null;
}

export function ExternalDocumentPreviewPanel(props: ExternalDocumentPreviewPanelProps) {
  const { error, isLoading, preview, retry } = useExternalSearchPreviewDocument(props.request?.absolutePath ?? null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const frame = useExternalDocumentPreviewPanelFrame(overlayRef, Boolean(props.request));
  const { handleImport, isImporting } = useOpenImportedExternalDocument(preview, props.onOpenImportedNode);

  if (!props.request) {
    return null;
  }

  const request = props.request;

  return (
    <PreviewWindow
      error={error}
      frame={frame}
      isImporting={isImporting}
      isLoading={isLoading}
      onClose={props.onClose}
      onImport={() => void handleImport()}
      onOpenInExternalLibrary={() => {
        props.onOpenInExternalLibrary(request);
        props.onClose();
      }}
      onRetry={retry}
      overlayRef={overlayRef}
      preview={preview}
      request={request}
    />
  );
}

function PreviewWindow(args: {
  error: string | null;
  frame: ReturnType<typeof useExternalDocumentPreviewPanelFrame>;
  isImporting: boolean;
  isLoading: boolean;
  onClose: () => void;
  onImport: () => void;
  onOpenInExternalLibrary: () => void;
  onRetry: () => void;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  preview: ExternalDocumentPreview | null;
  request: ExternalDocumentPreviewRequest;
}) {
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();

  return (
    <div aria-label="External document preview panel" className="pointer-events-none fixed inset-0 z-workspace-overlay" ref={args.overlayRef}>
      <section
        className={appFloatingSurfaceClassName('panel', 'pointer-events-auto absolute flex flex-col overflow-hidden')}
        style={args.frame.panelStyle}
      >
        <PreviewHeader
          fileLabel={args.preview?.fileName ?? args.request.absolutePath.split('/').at(-1) ?? 'External document'}
          isFullscreen={args.frame.isFullscreen}
          isImporting={args.isImporting}
          pathLabel={args.preview?.relativePath ?? args.request.absolutePath}
          onClose={args.onClose}
          onDragStart={args.frame.startDrag}
          onImport={args.onImport}
          onOpenInExternalLibrary={args.onOpenInExternalLibrary}
          onToggleFullscreen={args.frame.onToggleFullscreen}
          ready={Boolean(args.preview)}
        />
        <div className="relative min-h-0 flex-1 bg-canvas" ref={contentAreaRef}>
          <PreviewBody
            error={args.error}
            isLoading={args.isLoading}
            onOpenExternalLink={handleOpenExternalLink}
            onRetry={args.onRetry}
            preview={args.preview}
          />
          <LinkPanelStack
            anchorRootRef={contentAreaRef}
            onClose={handleCloseExternalLink}
            onStateChange={handleLinkPanelStateChange}
            panels={linkPanels}
          />
        </div>
        {!args.frame.isFullscreen ? (
          <div
            aria-hidden="true"
            className="absolute bottom-0 right-0 size-5 cursor-nwse-resize"
            onPointerDown={args.frame.onResizeStart}
          />
        ) : null}
      </section>
    </div>
  );
}

function PreviewHeader(args: {
  fileLabel: string;
  isFullscreen: boolean;
  isImporting: boolean;
  onClose: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onImport: () => void;
  onOpenInExternalLibrary: () => void;
  onToggleFullscreen: () => void;
  pathLabel: string;
  ready: boolean;
}) {
  return (
    <header
      className="flex cursor-move items-start justify-between gap-3 border-b border-border bg-bg-panel px-4 py-3"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement | null)?.closest('button')) {
          return;
        }
        args.onDragStart(event);
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{args.fileLabel}</div>
        <div className="mt-1 truncate text-xs text-foreground/60">{args.pathLabel}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <AppButton disabled={args.isImporting || !args.ready} onClick={args.onImport} size="sm">
          Import
        </AppButton>
        <AppButton disabled={!args.ready} onClick={args.onOpenInExternalLibrary} size="sm" variant="ghost">
          Open in External library
        </AppButton>
        <AppIconButton
          icon={args.isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          label={args.isFullscreen ? 'Restore preview window' : 'Full screen preview'}
          onClick={args.onToggleFullscreen}
        />
        <AppIconButton icon={<X className="size-4" />} label="Close preview" onClick={args.onClose} />
      </div>
    </header>
  );
}

function PreviewBody(args: {
  error: string | null;
  isLoading: boolean;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onRetry: () => void;
  preview: ExternalDocumentPreview | null;
}) {
  if (args.isLoading) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <AppLoadingState description="Loading the selected external document." title="Loading external document" />
      </div>
    );
  }

  if (args.error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <AppErrorState
          action={
            <AppButton onClick={args.onRetry} size="sm">
              Retry
            </AppButton>
          }
          description={args.error}
          title="External preview unavailable"
        />
      </div>
    );
  }

  if (!args.preview) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <AppLoadingState description="Loading the selected external document." title="Loading external document" />
      </div>
    );
  }

  return (
    <MarkdownEditor
      blockImageMaxHeightOverride={520}
      blockImageWidthOverride="min(100%, 40rem)"
      className="h-full"
      nodeId={args.preview.absolutePath}
      onChange={() => undefined}
      onOpenExternalLink={args.onOpenExternalLink}
      readOnly
      value={args.preview.content}
    />
  );
}
