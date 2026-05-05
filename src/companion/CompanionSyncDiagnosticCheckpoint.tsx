import type { SyncDiagnosticEvent } from '../../lib/platform/syncDiagnosticsContract';
import type { CombinedSyncDiagnosticResult } from '../shared/platform/companionSyncDiagnostics';

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? `${value}` : 'None';
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== 'number') return 'None';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function formatEvent(event: SyncDiagnosticEvent | null) {
  if (!event) return 'None';
  if (event.status === 'completed') return 'Finished pass';
  if (event.status === 'started') return 'Started';
  if (event.status === 'failed') return 'Needs retry';
  return 'Skipped';
}

function formatLag(result: CombinedSyncDiagnosticResult) {
  const cursor = result.android?.sync_state.pack_cursor;
  const desktopSeq = result.desktop?.sync_state.max_state_seq;
  if (typeof cursor !== 'number' || typeof desktopSeq !== 'number') return 'Missing data';
  const lag = Math.max(0, desktopSeq - cursor);
  return lag === 0 ? 'None' : `${lag} changes`;
}

function formatStructureStatus(result: CombinedSyncDiagnosticResult) {
  const cursor = result.android?.sync_state.pack_cursor;
  const desktopSeq = result.desktop?.sync_state.max_state_seq;
  if (typeof cursor !== 'number' || typeof desktopSeq !== 'number') return 'Missing data';
  return Math.max(0, desktopSeq - cursor) === 0 ? 'Up to date' : 'New changes available';
}

function formatActiveTopicBodyStatus(result: CombinedSyncDiagnosticResult) {
  const activeTopic = result.android?.content.active_topic;
  if (!activeTopic) return 'None';
  if (activeTopic.body_status === 'ready' || activeTopic.body_status === 'cached') return `Ready: ${activeTopic.title}`;
  if (activeTopic.body_status === 'missing') return `Caching: ${activeTopic.title}`;
  if (activeTopic.body_status === 'fetching') return `Loading: ${activeTopic.title}`;
  if (activeTopic.body_status === 'failed') return `Retry needed: ${activeTopic.title}`;
  return `Empty: ${activeTopic.title}`;
}

function latestEvent(events: SyncDiagnosticEvent[], status?: SyncDiagnosticEvent['status']) {
  const candidates = status ? events.filter((event) => event.status === status) : events;
  return [...candidates].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))[0] ?? null;
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
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">Sync status</h3>
      <div className="border-t border-companion-divider">
        <MetricRow label="Topic list" value={formatStructureStatus(props.result)} />
        <MetricRow label="New desktop changes" value={formatLag(props.result)} />
        <MetricRow
          label="Topics"
          value={`${formatNumber(props.result.android?.storage.active_node_count)} on device / ${formatNumber(props.result.desktop?.storage.active_node_count)} on desktop`}
        />
        <MetricRow label="Device changes to send" value={formatNumber(props.result.android?.sync_state.local_dirty_count)} />
        <MetricRow label="Topic bodies still caching" value={formatNumber(props.result.android?.content.missing_content_blob_count)} />
        <MetricRow label="Body bytes still caching" value={formatBytes(props.result.android?.content.missing_content_blob_bytes)} />
        <MetricRow label="Attachment files still caching" value={formatNumber(props.result.android?.content.missing_attachment_resource_count)} />
        <MetricRow label="Attachment bytes still caching" value={formatBytes(props.result.android?.content.missing_attachment_resource_bytes)} />
        <MetricRow label="Current topic" value={formatActiveTopicBodyStatus(props.result)} wrap />
        <MetricRow label="Latest sync" value={formatEvent(latestAndroidEvent)} wrap />
      </div>
    </section>
  );
}
