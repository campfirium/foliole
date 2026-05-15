import type {
  NativeReadwiseCleanupEntry,
  NativeReadwiseCleanupPreviewResult
} from '../../../lib/platform/nativeImportContract';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

function ReadwiseCleanupSummary({ preview }: { preview: NativeReadwiseCleanupPreviewResult }) {
  return (
    <div className="flex flex-wrap gap-2">
      {preview.delete_count > 0 ? (
        <span className="rounded-md border border-border/70 px-2.5 py-1 text-sm text-foreground/72">
          {preview.delete_count} will be deleted
        </span>
      ) : null}
      {preview.keep_count > 0 ? (
        <span className="rounded-md border border-border/70 px-2.5 py-1 text-sm text-foreground/72">
          {preview.keep_count} with additions will be kept
        </span>
      ) : null}
      {preview.external_document_count > 0 ? (
        <span className="rounded-md border border-border/70 px-2.5 py-1 text-sm text-foreground/72">
          {preview.external_document_count} external documents will be removed
        </span>
      ) : null}
    </div>
  );
}

function ReadwiseCleanupList({ entries }: { entries: NativeReadwiseCleanupEntry[] }) {
  return (
    <div className="max-h-[300px] overflow-auto rounded-md border border-border/65">
      {entries.map((entry) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_84px] gap-3 border-t border-border/50 px-3 py-2 text-sm first:border-t-0"
          key={`${entry.rule_id}:${entry.source_path}`}
        >
          <div className="min-w-0">
            <div className="truncate text-foreground">{entry.title}</div>
            <div className="truncate text-xs text-foreground/55">{entry.reason}</div>
          </div>
          <div className="text-right font-medium text-foreground/72">
            {entry.action === 'delete' ? 'Delete' : 'Keep'}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReadwiseCleanupDialog(props: {
  error: string | null;
  isRunning: boolean;
  onCancel: () => void;
  onRun: () => void;
  open: boolean;
  preview: NativeReadwiseCleanupPreviewResult | null;
}) {
  return (
    <AppDialog onOpenChange={(open) => (!open ? props.onCancel() : undefined)} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="w-[min(720px,calc(100vw-48px))] p-0"
        >
          <div className="border-b border-border/65 px-5 py-4">
            <AppDialogTitle className="text-base font-semibold">Clean up Readwise imports</AppDialogTitle>
          </div>
          <div className="space-y-4 px-5 py-5">
            {props.preview ? <ReadwiseCleanupSummary preview={props.preview} /> : null}
            {props.preview?.entries.length ? (
              <ReadwiseCleanupList entries={props.preview.entries} />
            ) : (
              <p className="text-sm text-foreground/65">
                {props.preview?.total_count
                  ? 'Readwise external folders will be cleared.'
                  : 'No Readwise imports are available to clean up.'}
              </p>
            )}
            {props.error ? <p className="text-sm text-red-700">{props.error}</p> : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border/65 px-5 py-4">
            <AppButton onClick={props.onCancel} variant="ghost">
              Cancel
            </AppButton>
            <AppButton
              disabled={props.isRunning || !props.preview || props.preview.total_count === 0}
              onClick={props.onRun}
              variant="primary"
            >
              {props.isRunning ? 'Cleaning...' : 'Clean up'}
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
