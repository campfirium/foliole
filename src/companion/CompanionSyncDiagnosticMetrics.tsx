import type { SyncDiagnosticSnapshot } from '../../lib/platform/syncDiagnosticsContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';

type Translate = ReturnType<typeof useTranslation>;

function formatNumber(value: number | null | undefined, t: Translate) {
  return typeof value === 'number' ? `${value}` : t('companion.sync.none');
}

function formatBytes(value: number | null | undefined, t: Translate) {
  if (typeof value !== 'number') {
    return t('companion.sync.none');
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
  const isDevice = snapshot.host === 'android' || snapshot.host === 'ios';
  const t = useTranslation();
  return (
    <div className="border-t border-companion-divider">
      <MetricRow label={t('companion.sync.diagnostics.connection')} value={snapshot.connection.state} />
      <MetricRow label={t('companion.sync.diagnostics.topics')} value={formatNumber(snapshot.storage.active_node_count, t)} />
      <MetricRow label={isDevice ? t('companion.sync.diagnostics.deviceChanges') : t('companion.sync.diagnostics.desktopChanges')} value={formatNumber(snapshot.sync_state.max_state_seq, t)} />
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.lastDesktopSync')} value={formatNumber(snapshot.sync_state.pack_cursor, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.readyToSend')} value={formatNumber(snapshot.sync_state.ready_dirty_count, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.waitingConfirmation')} value={formatNumber(snapshot.sync_state.pending_ack_count, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.changesNotSent')} value={formatNumber(snapshot.sync_state.push_issue_count ?? 0, t)} /> : null}
      <MetricRow label={t('companion.sync.diagnostics.bodiesToDownload')} value={formatNumber(snapshot.content.missing_content_blob_count, t)} />
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.bodyBytesToDownload')} value={formatBytes(snapshot.content.missing_content_blob_bytes ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.failedBodyDownloads')} value={`${formatNumber(snapshot.content.failed_content_blob_count ?? 0, t)} · ${formatBytes(snapshot.content.failed_content_blob_bytes ?? 0, t)}`} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.currentTopicBody')} value={formatNumber(snapshot.content.missing_active_topic_body_count ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.topicBodies')} value={formatNumber(snapshot.content.missing_topic_body_count ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.topLevelTopicBodies')} value={formatNumber(snapshot.content.missing_top_level_topic_body_count ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.nestedTopicBodies')} value={formatNumber(snapshot.content.missing_nested_topic_body_count ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.externalDocumentBodies')} value={formatNumber(snapshot.content.missing_external_document_body_count ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.reviewQueueBodies')} value={formatNumber(snapshot.content.missing_due_review_body_count ?? 0, t)} /> : null}
      <MetricRow label={t('companion.sync.diagnostics.attachmentsToDownload')} value={formatNumber(snapshot.content.missing_attachment_resource_count ?? 0, t)} />
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.attachmentBytesToDownload')} value={formatBytes(snapshot.content.missing_attachment_resource_bytes ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.failedAttachmentDownloads')} value={`${formatNumber(snapshot.content.failed_attachment_resource_count ?? 0, t)} · ${formatBytes(snapshot.content.failed_attachment_resource_bytes ?? 0, t)}`} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.currentTopicAttachments')} value={formatNumber(snapshot.content.missing_active_topic_attachment_resource_count ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.reviewQueueAttachments')} value={formatNumber(snapshot.content.missing_due_review_attachment_resource_count ?? 0, t)} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.imageAttachments')} value={`${formatNumber(snapshot.content.missing_image_attachment_resource_count ?? 0, t)} · ${formatBytes(snapshot.content.missing_image_attachment_resource_bytes ?? 0, t)}`} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.pdfAttachments')} value={`${formatNumber(snapshot.content.missing_pdf_attachment_resource_count ?? 0, t)} · ${formatBytes(snapshot.content.missing_pdf_attachment_resource_bytes ?? 0, t)}`} /> : null}
      {isDevice ? <MetricRow label={t('companion.sync.diagnostics.otherAttachments')} value={`${formatNumber(snapshot.content.missing_other_attachment_resource_count ?? 0, t)} · ${formatBytes(snapshot.content.missing_other_attachment_resource_bytes ?? 0, t)}`} /> : null}
    </div>
  );
}
