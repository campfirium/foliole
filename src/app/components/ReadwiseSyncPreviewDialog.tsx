import { forwardRef } from 'react';

import type {
  NativeReadwiseSyncPreviewDestination,
  NativeReadwiseSyncPreviewEntry,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppSpinner
} from '../../shared/ui';

const DESTINATION_LABELS: Record<NativeReadwiseSyncPreviewDestination, string> = {
  external: 'External',
  inbox: 'Inbox',
  off: 'Off'
};

function countEntries(
  entries: NativeReadwiseSyncPreviewEntry[],
  type: NativeReadwiseSyncPreviewEntry['highlight_type'],
  destination: NativeReadwiseSyncPreviewDestination
) {
  return entries.filter(
    (entry) =>
      entry.highlight_type === type &&
      entry.destination === destination &&
      (entry.status === 'new' || entry.status === 'updated')
  ).length;
}

function ReadwisePreviewSummary({ preview }: { preview: NativeReadwiseSyncPreviewResult }) {
  const rows = [
    { count: preview.active_count, label: 'already in Foliole' },
    { count: preview.trash_count, label: 'in Trash' },
    { count: preview.removed_count, label: 'in Removed' },
    {
      count: countEntries(preview.entries, 'with_highlights', 'inbox'),
      label: 'with highlights to Inbox'
    },
    {
      count: countEntries(preview.entries, 'with_highlights', 'external'),
      label: 'with highlights to External'
    },
    {
      count: countEntries(preview.entries, 'without_highlights', 'inbox'),
      label: 'without highlights to Inbox'
    },
    {
      count: countEntries(preview.entries, 'without_highlights', 'external'),
      label: 'without highlights to External'
    },
    { count: preview.off_count, label: 'skipped' },
    { count: preview.failed_count, label: 'failed' }
  ].filter((row) => row.count > 0);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-foreground/65">No Readwise source topics are ready to import.</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((row) => (
        <span
          className="rounded-md border border-border/70 px-2.5 py-1 text-sm text-foreground/72"
          key={row.label}
        >
          {row.count} {row.label}
        </span>
      ))}
    </div>
  );
}

function ReadwisePreviewList({ entries }: { entries: NativeReadwiseSyncPreviewEntry[] }) {
  return (
    <div className="max-h-[320px] overflow-auto rounded-md border border-border/65">
      {entries.map((entry) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_120px_88px] gap-3 border-t border-border/50 px-3 py-2 text-sm first:border-t-0"
          key={`${entry.source_kind}:${entry.source_path}`}
        >
          <div className="min-w-0 truncate text-foreground">{entry.source_path}</div>
          <div className="text-foreground/60">
            {entry.highlight_type === 'with_highlights' ? 'With highlights' : 'Without highlights'}
          </div>
          <div className="text-right font-medium text-foreground/72">
            {entry.status === 'blocked_deleted'
              ? entry.blocked_location === 'trash'
                ? 'Trash'
                : 'Removed'
              : entry.status === 'unchanged'
                ? 'Synced'
                : DESTINATION_LABELS[entry.destination]}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    isPreviewing: boolean;
    isStarting: boolean;
    onCancel: () => void;
    onStart: () => void;
    preview: NativeReadwiseSyncPreviewResult | null;
  }
>((props, ref) => (
  <AppDialogContent
    aria-describedby={undefined}
    className="w-[min(760px,calc(100vw-48px))] p-0"
    ref={ref}
  >
    <div className="border-b border-border/65 px-5 py-4">
      <AppDialogTitle className="text-base font-semibold">Readwise preview</AppDialogTitle>
    </div>
    <div className="space-y-4 px-5 py-5">
      {props.isPreviewing ? (
        <p className="text-sm text-foreground/65">Preparing preview...</p>
      ) : null}
      {props.preview ? <ReadwisePreviewSummary preview={props.preview} /> : null}
      {props.preview?.entries.length ? (
        <ReadwisePreviewList entries={props.preview.entries} />
      ) : null}
      {props.error ? <p className="text-sm text-red-700">{props.error}</p> : null}
    </div>
    <div className="flex items-center justify-end gap-2 border-t border-border/65 px-5 py-4">
      <AppButton onClick={props.onCancel} variant="ghost">
        Cancel
      </AppButton>
      <AppButton
        disabled={props.isStarting || !props.preview}
        onClick={props.onStart}
        variant="primary"
      >
        {props.isStarting ? (
          <AppSpinner decorative size="sm" />
        ) : null}
        Start
      </AppButton>
    </div>
  </AppDialogContent>
));
ReadwiseImportPreviewDialog.displayName = 'ReadwiseImportPreviewDialog';

export function ReadwiseSyncPreviewDialog(props: {
  error: string | null;
  isPreviewing: boolean;
  isStarting: boolean;
  notice: string | null;
  onCancel: () => void;
  onStart: () => void;
  open: boolean;
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
            isPreviewing={props.isPreviewing}
            isStarting={props.isStarting}
            onCancel={props.onCancel}
            onStart={props.onStart}
            preview={props.preview}
          />
        )}
      </AppDialogPortal>
    </AppDialog>
  );
}
