import type { SyncDiagnosticEvent } from '../../lib/platform/syncDiagnosticsContract';
import {
  findLaggingDesktopObjectTypes,
  type CombinedSyncDiagnosticResult
} from '../shared/platform/companionSyncDiagnostics';

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? `${value}` : 'None';
}

function formatEvent(event: SyncDiagnosticEvent | null) {
  if (!event) return 'None';
  return `${event.status}: ${event.message}`;
}

function formatLag(result: CombinedSyncDiagnosticResult) {
  const cursor = result.android?.sync_state.pack_cursor;
  const desktopSeq = result.desktop?.sync_state.max_state_seq;
  if (typeof cursor !== 'number' || typeof desktopSeq !== 'number') return 'Missing data';
  return `${Math.max(0, desktopSeq - cursor)} state rows`;
}

function formatStructureStatus(result: CombinedSyncDiagnosticResult) {
  const cursor = result.android?.sync_state.pack_cursor;
  const desktopSeq = result.desktop?.sync_state.max_state_seq;
  if (typeof cursor !== 'number' || typeof desktopSeq !== 'number') return 'Missing data';
  return Math.max(0, desktopSeq - cursor) === 0 ? 'Caught up' : 'Behind';
}

function formatActiveTopicBodyStatus(result: CombinedSyncDiagnosticResult) {
  const activeTopic = result.android?.content.active_topic;
  if (!activeTopic) return 'None';
  return `${activeTopic.body_status}: ${activeTopic.title}`;
}

function latestEvent(events: SyncDiagnosticEvent[], status?: SyncDiagnosticEvent['status']) {
  const candidates = status ? events.filter((event) => event.status === status) : events;
  return [...candidates].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))[0] ?? null;
}

function desktopObjectMaxSeq(result: CombinedSyncDiagnosticResult, objectType: string) {
  return result.desktop?.sync_state.state_counts.find((row) => row.object_type === objectType)?.max_state_seq;
}

function formatLaggingObjects(result: CombinedSyncDiagnosticResult) {
  const lagging = findLaggingDesktopObjectTypes({
    desktop: result.desktop,
    packCursor: result.android?.sync_state.pack_cursor
  });
  if (lagging.length === 0) return 'None';
  return lagging.map((row) => `${row.object_type} +${row.cursor_lag}`).join(', ');
}

function MetricRow(props: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-companion-divider py-3 text-sm last:border-b-0">
      <span className="shrink-0 text-companion-text-secondary">{props.label}</span>
      <span className={`text-right font-medium text-foreground ${props.wrap ? 'min-w-0 break-words' : 'max-w-48 truncate'}`}>
        {props.value}
      </span>
    </div>
  );
}

export function CompanionSyncDiagnosticCheckpoint(props: { result: CombinedSyncDiagnosticResult }) {
  const latestAndroidEvent = latestEvent(props.result.android?.events ?? []);
  const latestCompletedEvent = latestEvent(props.result.android?.events ?? [], 'completed');
  const latestFailedEvent = latestEvent(props.result.android?.events ?? [], 'failed');
  const cursor = props.result.android?.sync_state.pack_cursor;
  const desktopSeq = props.result.desktop?.sync_state.max_state_seq;
  const cursorLag = typeof cursor === 'number' && typeof desktopSeq === 'number' ? Math.max(0, desktopSeq - cursor) : null;
  const completedWhileBehind = Boolean(latestCompletedEvent && cursorLag && cursorLag > 0);
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">Sync checkpoint</h3>
      <div className="border-t border-companion-divider">
        <MetricRow label="Desktop ledger seq" value={formatNumber(desktopSeq)} />
        <MetricRow label="Android applied cursor" value={formatNumber(cursor)} />
        <MetricRow label="Structure cursor" value={formatStructureStatus(props.result)} />
        <MetricRow label="Cursor lag" value={formatLag(props.result)} />
        <MetricRow label="Desktop topic ledger" value={formatNumber(desktopObjectMaxSeq(props.result, 'node'))} />
        <MetricRow label="Lagging object types" value={formatLaggingObjects(props.result)} wrap />
        <MetricRow
          label="Topics"
          value={`${formatNumber(props.result.android?.storage.active_node_count)} Android / ${formatNumber(props.result.desktop?.storage.active_node_count)} Desktop`}
        />
        <MetricRow label="Dirty rows" value={`${formatNumber(props.result.android?.sync_state.local_dirty_count)} Android / ${formatNumber(props.result.desktop?.sync_state.local_dirty_count)} Desktop`} />
        <MetricRow label="Content cache backlog" value={formatNumber(props.result.android?.content.missing_content_blob_count)} />
        <MetricRow label="Current topic body" value={formatActiveTopicBodyStatus(props.result)} wrap />
        <MetricRow label="Latest Android event" value={formatEvent(latestAndroidEvent)} wrap />
        <MetricRow label="Last failed event" value={formatEvent(latestFailedEvent)} wrap />
      </div>
      {completedWhileBehind ? (
        <p className="mt-3 text-sm leading-6 text-error">
          A completed event exists, but the Android cursor is still behind desktop.
        </p>
      ) : null}
    </section>
  );
}
