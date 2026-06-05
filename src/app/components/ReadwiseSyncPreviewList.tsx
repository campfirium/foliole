import type {
  NativeReadwiseSyncPreviewDestination,
  NativeReadwiseSyncPreviewEntry,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { openLocalPath } from '../../shared/platform/runtimeExternalNavigation';

function isWritablePreviewEntry(entry: NativeReadwiseSyncPreviewEntry) {
  return entry.destination !== 'off' && (entry.status === 'new' || entry.status === 'updated');
}

function formatSpecialCounts(entries: NativeReadwiseSyncPreviewEntry[], t: Translate) {
  const highlightOnlyCount = entries.filter((entry) => entry.highlight_status === 'highlight_only').length;
  const unparsedCount = entries.filter((entry) => entry.highlight_status === 'unparsed').length;
  const parts = [
    highlightOnlyCount > 0 ? t('desktop.readwise.preview.highlightOnly', { count: highlightOnlyCount }) : null,
    unparsedCount > 0 ? t('desktop.readwise.preview.unparsed', { count: unparsedCount }) : null
  ].filter((part): part is string => Boolean(part));
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function formatDestinationSummary(entries: NativeReadwiseSyncPreviewEntry[], key: 'desktop.readwise.preview.readyImport' | 'desktop.readwise.preview.readyExternal', t: Translate) {
  return entries.length > 0 ? `${t(key, { count: entries.length })}${formatSpecialCounts(entries, t)}` : null;
}

export function ReadwisePreviewSummary({ preview }: { preview: NativeReadwiseSyncPreviewResult }) {
  const t = useTranslation();
  if (preview.total_count === 0) {
    return (
      <p className="text-sm text-foreground/65">{t('desktop.readwise.preview.empty')}</p>
    );
  }
  const writableEntries = preview.entries.filter(isWritablePreviewEntry);
  const inboxEntries = writableEntries.filter((entry) => entry.destination === 'inbox');
  const externalEntries = writableEntries.filter((entry) => entry.destination === 'external');
  const skippedCount = preview.entries.filter((entry) => entry.destination === 'off').length;
  const statusParts = [
    formatDestinationSummary(inboxEntries, 'desktop.readwise.preview.readyImport', t),
    formatDestinationSummary(externalEntries, 'desktop.readwise.preview.readyExternal', t),
    skippedCount > 0 ? t('desktop.readwise.preview.skipped', { count: skippedCount }) : null,
    preview.active_count > 0 ? t('desktop.readwise.preview.active', { count: preview.active_count }) : null,
    preview.failed_count > 0 ? t('desktop.readwise.preview.failed', { count: preview.failed_count }) : null
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="space-y-1 text-sm text-foreground/72">
      {statusParts.length ? <p className="font-medium text-foreground">{statusParts.join(', ')}.</p> : null}
    </div>
  );
}

const DESTINATION_LABEL_KEYS: Record<NativeReadwiseSyncPreviewDestination, 'desktop.readwise.preview.destination.external' | 'desktop.readwise.preview.destination.inbox' | 'desktop.readwise.preview.destination.off'> = {
  external: 'desktop.readwise.preview.destination.external',
  inbox: 'desktop.readwise.preview.destination.inbox',
  off: 'desktop.readwise.preview.destination.off'
};

function resolveEntryStatusLabel(entry: NativeReadwiseSyncPreviewEntry, t: Translate) {
  if (entry.status === 'unchanged') return t('desktop.readwise.preview.status.synced');
  if (entry.status === 'failed') return t('desktop.readwise.preview.status.failed');
  return t(DESTINATION_LABEL_KEYS[entry.destination]);
}

function resolveHighlightStatusLabel(entry: NativeReadwiseSyncPreviewEntry, t: Translate) {
  if (entry.highlight_status === 'highlight_only') return t('desktop.readwise.preview.highlightStatus.highlightOnly');
  if (entry.highlight_status === 'unparsed') return t('desktop.readwise.preview.highlightStatus.unparsed');
  return entry.highlight_type === 'with_highlights' ? t('desktop.readwise.preview.highlightStatus.withHighlights') : t('desktop.readwise.preview.highlightStatus.withoutHighlights');
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
  const t = useTranslation();
  if (entries.length === 0) return null;
  return (
    <div className="max-h-[320px] overflow-auto rounded-md border border-border/65">
      {sortPreviewEntries(entries).map((entry) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_120px_88px] gap-3 border-t border-border/50 px-3 py-2 text-sm first:border-t-0"
          key={`${entry.source_kind}:${entry.source_path}`}
        >
          <ReadwisePreviewSourceName entry={entry} />
          <div className="text-foreground/60">{resolveHighlightStatusLabel(entry, t)}</div>
          <div className="text-right font-medium text-foreground/72">
            {resolveEntryStatusLabel(entry, t)}
          </div>
        </div>
      ))}
    </div>
  );
}
