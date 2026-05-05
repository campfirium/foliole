import { Maximize2, Minimize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';

import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import {
  importRuntimeExternalSearchDocument,
  loadRuntimeExternalSearchPreview,
  type RuntimeExternalSearchPreview
} from '../../shared/platform/externalSearchBridge';
import { AppButton, AppEmptyState, AppIconButton, appFloatingSurfaceClassName } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useExternalDocumentPreviewPanelFrame } from './externalDocumentPreviewPanelState';
import type { ExternalDocumentPreviewRequest } from './externalDocumentPreviewState';
import { LinkPanelStack } from './LinkPanelStack';
import { useExternalLinkPanels } from './useExternalLinkPanels';

interface ExternalDocumentPreviewPanelProps {
  onClose: () => void;
  onOpenImportedNode: (result: NativeTextImportResult) => void;
  onOpenInExternalLibrary: (request: ExternalDocumentPreviewRequest) => void;
  request: ExternalDocumentPreviewRequest | null;
}

function usePreviewDocument(request: ExternalDocumentPreviewRequest | null) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RuntimeExternalSearchPreview | null>(null);

  useEffect(() => {
    if (!request) {
      setError(null);
      setPreview(null);
      return;
    }

    let alive = true;
    setError(null);
    setPreview(null);
    void loadRuntimeExternalSearchPreview(request.absolutePath)
      .then((result) => {
        if (!alive) {
          return;
        }
        setPreview(result);
        setError(result ? null : 'Could not load external document preview.');
      })
      .catch((nextError) => {
        if (!alive) {
          return;
        }
        setPreview(null);
        setError(nextError instanceof Error ? nextError.message : 'Could not load external document preview.');
      });

    return () => {
      alive = false;
    };
  }, [request]);

  return { error, preview };
}

export function ExternalDocumentPreviewPanel(props: ExternalDocumentPreviewPanelProps) {
  const { error, preview } = usePreviewDocument(props.request);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const frame = useExternalDocumentPreviewPanelFrame(overlayRef, Boolean(props.request));
  const { handleImport, isImporting } = usePreviewImportHandler(preview, props.onOpenImportedNode);

  if (!props.request) {
    return null;
  }

  const request = props.request;

  return (
    <PreviewWindow
      error={error}
      frame={frame}
      isImporting={isImporting}
      onClose={props.onClose}
      onImport={() => void handleImport()}
      onOpenInExternalLibrary={() => {
        props.onOpenInExternalLibrary(request);
        props.onClose();
      }}
      overlayRef={overlayRef}
      preview={preview}
      request={request}
    />
  );
}

function usePreviewImportHandler(
  preview: RuntimeExternalSearchPreview | null,
  onOpenImportedNode: (result: NativeTextImportResult) => void
) {
  const [isImporting, setIsImporting] = useState(false);

  async function handleImport() {
    if (!preview) {
      return;
    }
    setIsImporting(true);
    try {
      const result = await importRuntimeExternalSearchDocument(preview.absolutePath);
      if (!result?.node_id) {
        return;
      }
      await useWorkspaceStore.persist.rehydrate();
      onOpenImportedNode(result);
    } finally {
      setIsImporting(false);
    }
  }

  return { handleImport, isImporting };
}

function PreviewWindow(args: {
  error: string | null;
  frame: ReturnType<typeof useExternalDocumentPreviewPanelFrame>;
  isImporting: boolean;
  onClose: () => void;
  onImport: () => void;
  onOpenInExternalLibrary: () => void;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  preview: RuntimeExternalSearchPreview | null;
  request: ExternalDocumentPreviewRequest;
}) {
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();

  return (
    <div aria-label="External document preview panel" className="pointer-events-none fixed inset-0 z-40" ref={args.overlayRef}>
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
          <PreviewBody error={args.error} onOpenExternalLink={handleOpenExternalLink} preview={args.preview} />
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
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  preview: RuntimeExternalSearchPreview | null;
}) {
  if (!args.preview) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <AppEmptyState
          description={args.error ?? 'Loading the selected external document.'}
          title={args.error ? 'External preview unavailable' : 'Loading external document'}
        />
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
