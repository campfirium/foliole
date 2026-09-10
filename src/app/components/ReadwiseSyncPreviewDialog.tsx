import { forwardRef } from 'react';

import type {
  NativeReadwiseImportRunProgressEvent,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
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
  { notice: string; onCancel: () => void; t: Translate }
>((props, ref) => (
  <AppDialogContent
    aria-describedby={undefined}
    className="w-[min(560px,calc(100vw-48px))]"
    layout="task"
    ref={ref}
  >
    <AppDialogTitle className="text-base font-semibold">{props.t('desktop.readwise.importDialog.blockedTitle')}</AppDialogTitle>
    <AppDialogBody>
      <p className="text-sm leading-5 text-foreground/70">{props.notice}</p>
    </AppDialogBody>
    <AppDialogActions>
        <AppButton onClick={props.onCancel} variant="default">
          {props.t('desktop.readwise.importDialog.ok')}
        </AppButton>
    </AppDialogActions>
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
    t: Translate;
  }
>((props, ref) => (
  <AppDialogContent
    aria-describedby={undefined}
    className="w-[min(760px,calc(100vw-48px))]"
    layout="task"
    ref={ref}
  >
    <AppDialogTitle className="text-base font-semibold">
        {props.isStarting ? props.t('desktop.readwise.importDialog.title') : props.t('desktop.readwise.importDialog.previewTitle')}
    </AppDialogTitle>
    <AppDialogBody className="space-y-4">
      {props.isPreviewing ? (
        <p className="text-sm text-foreground/65">{props.t('desktop.readwise.importDialog.preparing')}</p>
      ) : null}
      {props.preview ? <ReadwisePreviewSummary preview={props.preview} /> : null}
      <ReadwisePreviewList entries={props.preview?.entries ?? []} />
      <ReadwiseImportProgressPanel
        isRunning={props.isStarting}
        progress={toReadwiseImportProgressView(props.progress)}
      />
      {props.error ? <p className="text-sm text-red-700">{props.error}</p> : null}
    </AppDialogBody>
    <AppDialogActions>
      <AppButton
        disabled={props.isCancelling}
        onClick={props.onCancel}
        variant={props.isStarting ? 'default' : 'ghost'}
      >
        {props.isCancelling ? props.t('desktop.readwise.importDialog.cancelling') : props.t('desktop.readwise.importDialog.cancel')}
      </AppButton>
      <AppButton
        disabled={props.isStarting || !props.preview}
        onClick={props.onStart}
        variant="default"
      >
        {props.isStarting ? props.t('desktop.readwise.importDialog.importing') : props.t('desktop.readwise.importDialog.import')}
      </AppButton>
    </AppDialogActions>
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
  const t = useTranslation();
  return (
    <AppDialog onOpenChange={(open) => (!open ? props.onCancel() : undefined)} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        {props.notice ? (
          <ReadwiseBlockedPreviewDialog notice={props.notice} onCancel={props.onCancel} t={t} />
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
            t={t}
          />
        )}
      </AppDialogPortal>
    </AppDialog>
  );
}
