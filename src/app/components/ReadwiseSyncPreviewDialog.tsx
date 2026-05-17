import { forwardRef } from 'react';

import type {
  NativeReadwiseImportRunProgressEvent,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

import { ReadwiseImportProgressPanel } from './ReadwiseImportProgressPanel';
import { toReadwiseImportProgressView } from './readwiseImportProgressView';
import { ReadwisePreviewList, ReadwisePreviewSummary } from './ReadwiseSyncPreviewList';

const ReadwiseBlockedPreviewDialog = forwardRef<
  HTMLDivElement,
  { notice: string; onCancel: () => void }
>((props, ref) => (
  <AppDialogContent
    aria-describedby={undefined}
    className="w-[min(560px,calc(100vw-48px))] p-0"
    ref={ref}
  >
    <div className="space-y-5 px-5 py-5">
      <AppDialogTitle className="text-base font-semibold">Preview the import first</AppDialogTitle>
      <p className="text-sm leading-5 text-foreground/70">{props.notice}</p>
      <div className="flex justify-end">
        <AppButton onClick={props.onCancel} variant="primary">
          OK
        </AppButton>
      </div>
    </div>
  </AppDialogContent>
));
ReadwiseBlockedPreviewDialog.displayName = 'ReadwiseBlockedPreviewDialog';

const ReadwiseImportPreviewDialog = forwardRef<
  HTMLDivElement,
  {
    error: string | null;
    isCancelling: boolean;
    isPreviewing: boolean;
    isStarting: boolean;
    onCancel: () => void;
    onStart: () => void;
    progress: NativeReadwiseImportRunProgressEvent | null;
    preview: NativeReadwiseSyncPreviewResult | null;
  }
>((props, ref) => (
  <AppDialogContent
    aria-describedby={undefined}
    className="w-[min(760px,calc(100vw-48px))] p-0"
    ref={ref}
  >
    <div className="border-b border-border/65 px-5 py-4">
      <AppDialogTitle className="text-base font-semibold">
        {props.isStarting ? 'Readwise import' : 'Readwise import preview'}
      </AppDialogTitle>
    </div>
    <div className="space-y-4 px-5 py-5">
      {props.isPreviewing ? (
        <p className="text-sm text-foreground/65">Preparing preview...</p>
      ) : null}
      {props.preview ? <ReadwisePreviewSummary preview={props.preview} /> : null}
      <ReadwisePreviewList entries={props.preview?.entries ?? []} />
      <ReadwiseImportProgressPanel
        isRunning={props.isStarting}
        progress={toReadwiseImportProgressView(props.progress)}
      />
      {props.error ? <p className="text-sm text-red-700">{props.error}</p> : null}
    </div>
    <div className="flex items-center justify-end gap-2 border-t border-border/65 px-5 py-4">
      <AppButton
        disabled={props.isCancelling}
        onClick={props.onCancel}
        variant={props.isStarting ? 'primary' : 'ghost'}
      >
        {props.isCancelling ? 'Cancelling' : 'Cancel'}
      </AppButton>
      <AppButton
        disabled={props.isStarting || !props.preview}
        onClick={props.onStart}
        variant="primary"
      >
        {props.isStarting ? 'Importing' : 'Import'}
      </AppButton>
    </div>
  </AppDialogContent>
));
ReadwiseImportPreviewDialog.displayName = 'ReadwiseImportPreviewDialog';

export function ReadwiseSyncPreviewDialog(props: {
  error: string | null;
  isCancelling: boolean;
  isPreviewing: boolean;
  isStarting: boolean;
  notice: string | null;
  onCancel: () => void;
  onStart: () => void;
  open: boolean;
  progress: NativeReadwiseImportRunProgressEvent | null;
  preview: NativeReadwiseSyncPreviewResult | null;
}) {
  return (
    <AppDialog onOpenChange={(open) => (!open ? props.onCancel() : undefined)} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        {props.notice ? (
          <ReadwiseBlockedPreviewDialog notice={props.notice} onCancel={props.onCancel} />
        ) : (
          <ReadwiseImportPreviewDialog
            error={props.error}
            isCancelling={props.isCancelling}
            isPreviewing={props.isPreviewing}
            isStarting={props.isStarting}
            onCancel={props.onCancel}
            onStart={props.onStart}
            progress={props.progress}
            preview={props.preview}
          />
        )}
      </AppDialogPortal>
    </AppDialog>
  );
}
