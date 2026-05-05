import type { SyncDiagnosticSnapshot } from '../../lib/platform/syncDiagnosticsContract';

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? `${value}` : 'None';
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 'None';
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
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

export function SnapshotMetrics(props: { snapshot: SyncDiagnosticSnapshot }) {
  const snapshot = props.snapshot;
  const isAndroid = snapshot.host === 'android';
  return (
    <div className="border-t border-companion-divider">
      <MetricRow label="Connection" value={snapshot.connection.state} />
      <MetricRow label="Topics" value={formatNumber(snapshot.storage.active_node_count)} />
      <MetricRow label={isAndroid ? 'Device changes' : 'Desktop changes'} value={formatNumber(snapshot.sync_state.max_state_seq)} />
      {isAndroid ? <MetricRow label="Last desktop sync" value={formatNumber(snapshot.sync_state.pack_cursor)} /> : null}
      {isAndroid ? <MetricRow label="Waiting for confirmation" value={formatNumber(snapshot.sync_state.pending_ack_count)} /> : null}
      {isAndroid ? <MetricRow label="Changes needing review" value={formatNumber(snapshot.sync_state.push_issue_count ?? 0)} /> : null}
      <MetricRow label="Bodies to download" value={formatNumber(snapshot.content.missing_content_blob_count)} />
      {isAndroid ? <MetricRow label="Body bytes to download" value={formatBytes(snapshot.content.missing_content_blob_bytes ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Current topic body" value={formatNumber(snapshot.content.missing_active_topic_body_count ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Topic bodies" value={formatNumber(snapshot.content.missing_topic_body_count ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Top-level topic bodies" value={formatNumber(snapshot.content.missing_top_level_topic_body_count ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Nested topic bodies" value={formatNumber(snapshot.content.missing_nested_topic_body_count ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="External document bodies" value={formatNumber(snapshot.content.missing_external_document_body_count ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Review queue bodies" value={formatNumber(snapshot.content.missing_due_review_body_count ?? 0)} /> : null}
      <MetricRow label="Attachments to download" value={formatNumber(snapshot.content.missing_attachment_resource_count ?? 0)} />
      {isAndroid ? <MetricRow label="Attachment bytes to download" value={formatBytes(snapshot.content.missing_attachment_resource_bytes ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Current topic attachments" value={formatNumber(snapshot.content.missing_active_topic_attachment_resource_count ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Review queue attachments" value={formatNumber(snapshot.content.missing_due_review_attachment_resource_count ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Image attachments" value={`${formatNumber(snapshot.content.missing_image_attachment_resource_count ?? 0)} · ${formatBytes(snapshot.content.missing_image_attachment_resource_bytes ?? 0)}`} /> : null}
      {isAndroid ? <MetricRow label="PDF attachments" value={`${formatNumber(snapshot.content.missing_pdf_attachment_resource_count ?? 0)} · ${formatBytes(snapshot.content.missing_pdf_attachment_resource_bytes ?? 0)}`} /> : null}
      {isAndroid ? <MetricRow label="Other attachments" value={`${formatNumber(snapshot.content.missing_other_attachment_resource_count ?? 0)} · ${formatBytes(snapshot.content.missing_other_attachment_resource_bytes ?? 0)}`} /> : null}
    </div>
  );
}
