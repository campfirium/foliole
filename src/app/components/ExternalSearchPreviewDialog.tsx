import { useState } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import {
  importExternalDocument,
  type ExternalDocumentImportResult
} from '../../shared/platform/externalDocumentImportRepository';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppErrorState, AppLoadingState } from '../../shared/ui';

import { useExternalSearchPreviewDocument } from './externalSearchPreviewState';

function ExternalSearchPreviewBody(args: {
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  preview: ExternalDocumentPreview | null;
}) {
  if (args.isLoading) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <AppLoadingState description="Loading the selected external document." title="Loading external preview" />
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
        <AppLoadingState description="Loading the selected external document." title="Loading external preview" />
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
      readOnly
      value={args.preview.content}
    />
  );
}

export function ExternalSearchPreviewDialog(props: {
  absolutePath: string | null;
  onImportComplete: (result: ExternalDocumentImportResult) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { error, isLoading, preview, retry } = useExternalSearchPreviewDocument(props.absolutePath);
  const [isImporting, setIsImporting] = useState(false);

  async function handleImport() {
    if (!preview) {
      return;
    }
    setIsImporting(true);
    try {
      const result = await importExternalDocument(preview.absolutePath);
      if (result) {
        props.onImportComplete(result);
      }
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <AppDialog onOpenChange={props.onOpenChange} open={Boolean(props.absolutePath)}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 flex h-[min(760px,calc(100dvh-48px))] w-[min(980px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border-border/45 bg-bg-panel p-0"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0">
              <AppDialogTitle className="text-base font-semibold text-foreground">{preview?.fileName ?? 'External preview'}</AppDialogTitle>
              <p className="mt-1 break-all text-sm text-foreground/60">{preview?.relativePath ?? props.absolutePath}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <AppButton disabled={!preview || isImporting} onClick={() => void handleImport()}>
                Import
              </AppButton>
              <AppButton onClick={() => props.onOpenChange(false)} variant="ghost">
                Close
              </AppButton>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ExternalSearchPreviewBody error={error} isLoading={isLoading} onRetry={retry} preview={preview} />
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
