import type {
  NativeReadwiseSyncPreviewDestination,
  NativeReadwiseSyncPreviewEntry,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import { openLocalPath } from '../../shared/platform/runtimeExternalNavigation';

function isWritablePreviewEntry(entry: NativeReadwiseSyncPreviewEntry) {
  return entry.destination !== 'off' && (entry.status === 'new' || entry.status === 'updated');
}

function formatSpecialCounts(entries: NativeReadwiseSyncPreviewEntry[]) {
  const highlightOnlyCount = entries.filter((entry) => entry.highlight_status === 'highlight_only').length;
  const unparsedCount = entries.filter((entry) => entry.highlight_status === 'unparsed').length;
  const parts = [
    highlightOnlyCount > 0 ? `${highlightOnlyCount} highlight-only` : null,
    unparsedCount > 0 ? `${unparsedCount} unparsed` : null
  ].filter((part): part is string => Boolean(part));
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function formatDestinationSummary(entries: NativeReadwiseSyncPreviewEntry[], label: string) {
  return entries.length > 0 ? `${entries.length} ${label}${formatSpecialCounts(entries)}` : null;
}

export function ReadwisePreviewSummary({ preview }: { preview: NativeReadwiseSyncPreviewResult }) {
  if (preview.total_count === 0) {
    return (
      <p className="text-sm text-foreground/65">No Readwise source topics are ready to import.</p>
    );
  }
  const writableEntries = preview.entries.filter(isWritablePreviewEntry);
  const inboxEntries = writableEntries.filter((entry) => entry.destination === 'inbox');
  const externalEntries = writableEntries.filter((entry) => entry.destination === 'external');
  const skippedCount = preview.entries.filter((entry) => entry.destination === 'off').length;
  const statusParts = [
    formatDestinationSummary(inboxEntries, 'ready to import'),
    formatDestinationSummary(externalEntries, 'ready for external library'),
    skippedCount > 0 ? `${skippedCount} skipped` : null,
    preview.active_count > 0 ? `${preview.active_count} already in Foliole` : null,
    preview.failed_count > 0 ? `${preview.failed_count} failed` : null
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="space-y-1 text-sm text-foreground/72">
      {statusParts.length ? <p className="font-medium text-foreground">{statusParts.join(', ')}.</p> : null}
    </div>
  );
}

const DESTINATION_LABELS: Record<NativeReadwiseSyncPreviewDestination, string> = {
  external: 'External',
  inbox: 'Inbox',
  off: 'Off'
};

function resolveEntryStatusLabel(entry: NativeReadwiseSyncPreviewEntry) {
  if (entry.status === 'unchanged') return 'Synced';
  if (entry.status === 'failed') return 'Failed';
  return DESTINATION_LABELS[entry.destination];
}

function resolveHighlightStatusLabel(entry: NativeReadwiseSyncPreviewEntry) {
  if (entry.highlight_status === 'highlight_only') return 'Highlight-only';
  if (entry.highlight_status === 'unparsed') return 'Unparsed';
  return entry.highlight_type === 'with_highlights' ? 'With highlights' : 'Without highlights';
}

function ReadwisePreviewSourceName({ entry }: { entry: NativeReadwiseSyncPreviewEntry }) {
  if (!entry.open_path) {
    return <div className="min-w-0 truncate text-foreground">{entry.source_path}</div>;
  }
  return (
    <button
      className="min-w-0 truncate text-left text-foreground underline-offset-2 hover:underline hover:decoration-foreground/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => void openLocalPath(entry.open_path ?? '')}
      title={entry.source_path}
      type="button"
    >
      {entry.source_path}
    </button>
  );
}

function sortPreviewEntries(entries: NativeReadwiseSyncPreviewEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.highlight_status === 'unparsed' && right.highlight_status !== 'unparsed') return -1;
    if (right.highlight_status === 'unparsed' && left.highlight_status !== 'unparsed') return 1;
    if (left.highlight_status === 'highlight_only' && right.highlight_status !== 'highlight_only') return -1;
    if (right.highlight_status === 'highlight_only' && left.highlight_status !== 'highlight_only') return 1;
    return 0;
  });
}

export function ReadwisePreviewList({ entries }: { entries: NativeReadwiseSyncPreviewEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="max-h-[320px] overflow-auto rounded-md border border-border/65">
      {sortPreviewEntries(entries).map((entry) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_120px_88px] gap-3 border-t border-border/50 px-3 py-2 text-sm first:border-t-0"
          key={`${entry.source_kind}:${entry.source_path}`}
        >
          <ReadwisePreviewSourceName entry={entry} />
          <div className="text-foreground/60">{resolveHighlightStatusLabel(entry)}</div>
          <div className="text-right font-medium text-foreground/72">
            {resolveEntryStatusLabel(entry)}
          </div>
        </div>
      ))}
    </div>
  );
}
