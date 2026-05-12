import type { RuntimeUnsyncedSourceEntry } from '../../shared/platform/unsyncedSourcesRuntimeRepository';
import { AppButton, AppEmptyState, AppStatusBadge } from '../../shared/ui';

export function UnsyncedSourcePreview(props: {
  entry: RuntimeUnsyncedSourceEntry | null;
  errorMessage: string;
  isRestoring: boolean;
  needsSourceUpdateConfirm: boolean;
  onRestore: () => void;
}) {
  if (!props.entry) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
        <AppEmptyState description="Select an unsynced import to preview its source link." title="No import selected" />
      </div>
    );
  }

  return (
    <section aria-label="Unsynced import preview" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{props.entry.title}</h2>
        <p className="mt-1 text-xs leading-5 text-foreground/60">{props.entry.sourcePath}</p>
      </div>
      <p className="text-sm leading-6 text-foreground/70">
        This source still exists outside Foliole. Automatic import will keep skipping it unless you import it again.
      </p>
      {props.entry.hasSourceUpdate ? <AppStatusBadge label="Source updated" tone="warning" /> : null}
      {props.entry.contentPreview ? (
        <div className="rounded-md border border-border/55 bg-bg-panel px-3 py-2">
          <p className="text-sm leading-6 text-foreground/72">{props.entry.contentPreview}</p>
        </div>
      ) : null}
      {props.needsSourceUpdateConfirm ? (
        <p className="text-sm leading-6 text-foreground/70">
          The source changed after this topic was deleted. Import again will use the current source text.
        </p>
      ) : null}
      {props.errorMessage ? <p className="text-sm leading-6 text-red-700">{props.errorMessage}</p> : null}
      <div>
        <AppButton disabled={props.isRestoring} onClick={props.onRestore} variant="primary">
          {props.isRestoring
            ? 'Importing...'
            : props.needsSourceUpdateConfirm
              ? 'Import current source'
              : 'Import again'}
        </AppButton>
      </div>
    </section>
  );
}

export function UnsyncedSourceList(props: {
  entries: RuntimeUnsyncedSourceEntry[];
  onSelect: (entry: RuntimeUnsyncedSourceEntry) => void;
  selectedId: string | null;
}) {
  if (props.entries.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-3 py-6">
        <AppEmptyState description="Unsynced keep or Readwise topics will appear here while their source still exists." title="No unsynced imports" />
      </div>
    );
  }

  return (
    <div aria-label="Unsynced imports" className="flex flex-col gap-1" role="list">
      {props.entries.map((entry) => (
        <button
          className="flex min-h-12 w-full min-w-0 flex-col items-start rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/[0.04] data-[active=true]:bg-foreground/[0.06]"
          data-active={props.selectedId === entry.id}
          key={entry.id}
          onClick={() => props.onSelect(entry)}
          type="button"
        >
          <span className="max-w-full truncate font-medium text-foreground">{entry.title}</span>
          <span className="max-w-full truncate text-xs text-foreground/55">{entry.sourcePath}</span>
        </button>
      ))}
    </div>
  );
}
