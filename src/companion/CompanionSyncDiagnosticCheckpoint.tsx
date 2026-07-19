import type { SyncDiagnosticEvent } from '../../lib/platform/syncDiagnosticsContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CombinedSyncDiagnosticResult } from '../shared/platform/companion/sync/diagnostics/companionSyncDiagnostics';
import { FULL_SYNC_COMPLETED_MESSAGE } from '../shared/platform/companionSyncEventSemantics';

type Translate = ReturnType<typeof useTranslation>;

function formatNumber(value: number | null | undefined, t: Translate) {
  return typeof value === 'number' ? `${value}` : t('companion.sync.none');
}

function formatBytes(value: number | null | undefined, t: Translate) {
  if (typeof value !== 'number') return t('companion.sync.none');
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function formatEvent(event: SyncDiagnosticEvent | null, t: Translate) {
  if (!event) return t('companion.sync.none');
  if (event.status === 'completed') {
    return event.message === FULL_SYNC_COMPLETED_MESSAGE ? t('companion.sync.diagnostics.allStagesCompleted') : t('companion.sync.diagnostics.earlierCheckFinished');
  }
  if (event.status === 'started') return t('companion.sync.started');
  if (event.status === 'failed') return t('companion.sync.diagnostics.needsRetry');
  return t('companion.sync.checked');
}

function formatLag(result: CombinedSyncDiagnosticResult, t: Translate) {
  const cursor = result.android?.sync_state.pack_cursor;
  const desktopSeq = result.desktop?.sync_state.max_state_seq;
  if (typeof cursor !== 'number' || typeof desktopSeq !== 'number') return t('companion.sync.diagnostics.missingData');
  const lag = Math.max(0, desktopSeq - cursor);
  return lag === 0 ? t('companion.sync.none') : t('companion.sync.diagnostics.changes', { count: lag });
}

function formatStructureStatus(result: CombinedSyncDiagnosticResult, t: Translate) {
  const cursor = result.android?.sync_state.pack_cursor;
  const desktopSeq = result.desktop?.sync_state.max_state_seq;
  if (typeof cursor !== 'number' || typeof desktopSeq !== 'number') return t('companion.sync.diagnostics.missingData');
  return Math.max(0, desktopSeq - cursor) === 0 ? t('companion.sync.diagnostics.upToDate') : t('companion.sync.diagnostics.newChangesAvailable');
}

function formatBacklogStage(count: number | null | undefined, t: Translate) {
  if (typeof count !== 'number') return t('companion.sync.diagnostics.missingData');
  return count === 0 ? t('companion.sync.diagnostics.done') : t('companion.sync.diagnostics.remaining', { count });
}

function formatCountedSyncUnit(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatReviewQueueStatus(result: CombinedSyncDiagnosticResult, t: Translate) {
  const activeBodies = result.android?.content.missing_active_topic_body_count;
  const activeAttachments = result.android?.content.missing_active_topic_attachment_resource_count;
  if (typeof activeBodies === 'number' && typeof activeAttachments === 'number' && (activeBodies > 0 || activeAttachments > 0)) {
    const segments = [];
    if (activeBodies > 0) segments.push(formatCountedSyncUnit(activeBodies, t('companion.sync.progress.body'), t('companion.sync.progress.bodies')));
    if (activeAttachments > 0) segments.push(formatCountedSyncUnit(activeAttachments, t('companion.sync.progress.attachment'), t('companion.sync.progress.attachmentsCount')));
    return `${t('companion.sync.progress.currentTopic')}: ${segments.join(', ')} ${t('companion.sync.diagnostics.remaining', { count: '' }).trim()}`;
  }
  const bodies = result.android?.content.missing_due_review_body_count;
  const attachments = result.android?.content.missing_due_review_attachment_resource_count;
  if (typeof bodies !== 'number' || typeof attachments !== 'number') return t('companion.sync.diagnostics.missingData');
  if (bodies === 0 && attachments === 0) return t('companion.sync.diagnostics.done');
  const segments = [];
  if (bodies > 0) segments.push(formatCountedSyncUnit(bodies, t('companion.sync.progress.body'), t('companion.sync.progress.bodies')));
  if (attachments > 0) segments.push(formatCountedSyncUnit(attachments, t('companion.sync.progress.attachment'), t('companion.sync.progress.attachmentsCount')));
  return `${segments.join(', ')} ${t('companion.sync.diagnostics.remaining', { count: '' }).trim()}`;
}

function formatActiveTopicBodyStatus(result: CombinedSyncDiagnosticResult, t: Translate) {
  const activeTopic = result.android?.content.active_topic;
  if (!activeTopic) return t('companion.sync.none');
  if (activeTopic.body_status === 'ready' || activeTopic.body_status === 'cached') return t('companion.sync.diagnostics.ready', { title: activeTopic.title });
  if (activeTopic.body_status === 'missing') return t('companion.sync.diagnostics.downloading', { title: activeTopic.title });
  if (activeTopic.body_status === 'fetching') return t('companion.sync.diagnostics.loading', { title: activeTopic.title });
  if (activeTopic.body_status === 'failed') return t('companion.sync.diagnostics.retryNeeded', { title: activeTopic.title });
  return t('companion.sync.diagnostics.emptyTopic', { title: activeTopic.title });
}

function latestEvent(events: SyncDiagnosticEvent[], status?: SyncDiagnosticEvent['status']) {
  const candidates = status ? events.filter((event) => event.status === status) : events;
  return [...candidates].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))[0] ?? null;
}

function MetricRow(props: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-companion-divider py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
      <span className="min-w-0 break-words text-companion-text-secondary">{props.label}</span>
      <span className={`min-w-0 font-medium text-foreground sm:text-right ${props.wrap ? 'break-words' : 'break-words sm:max-w-48'}`}>
        {props.value}
      </span>
    </div>
  );
}

export function CompanionSyncDiagnosticCheckpoint(props: { result: CombinedSyncDiagnosticResult }) {
  const latestAndroidEvent = latestEvent(props.result.android?.events ?? []);
  const t = useTranslation();
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{t('companion.sync.diagnostics.status')}</h3>
      <div className="border-t border-companion-divider">
        <MetricRow label={t('companion.sync.diagnostics.topicList')} value={formatStructureStatus(props.result, t)} />
        <MetricRow label={t('companion.sync.diagnostics.stageLibrary')} value={formatStructureStatus(props.result, t)} />
        <MetricRow label={t('companion.sync.diagnostics.stageReview')} value={formatReviewQueueStatus(props.result, t)} />
        <MetricRow label={t('companion.sync.diagnostics.stageBodies')} value={formatBacklogStage(props.result.android?.content.missing_content_blob_count, t)} />
        <MetricRow label={t('companion.sync.diagnostics.stageAttachments')} value={formatBacklogStage(props.result.android?.content.missing_attachment_resource_count, t)} />
        <MetricRow label={t('companion.sync.diagnostics.newDesktopChanges')} value={formatLag(props.result, t)} />
        <MetricRow
          label={t('companion.sync.diagnostics.topics')}
          value={t('companion.sync.diagnostics.onDeviceDesktop', {
            desktop: formatNumber(props.result.desktop?.storage.active_node_count, t),
            device: formatNumber(props.result.android?.storage.active_node_count, t)
          })}
        />
        <MetricRow label={t('companion.sync.diagnostics.deviceChangesToSend')} value={formatNumber(props.result.android?.sync_state.ready_dirty_count, t)} />
        <MetricRow label={t('companion.sync.diagnostics.bodiesToDownload')} value={formatNumber(props.result.android?.content.missing_content_blob_count, t)} />
        <MetricRow label={t('companion.sync.diagnostics.topicBodiesToDownload')} value={formatNumber(props.result.android?.content.missing_topic_body_count, t)} />
        <MetricRow label={t('companion.sync.diagnostics.externalBodiesToDownload')} value={formatNumber(props.result.android?.content.missing_external_document_body_count, t)} />
        <MetricRow label={t('companion.sync.diagnostics.bodyBytesToDownload')} value={formatBytes(props.result.android?.content.missing_content_blob_bytes, t)} />
        <MetricRow label={t('companion.sync.diagnostics.attachmentFilesToDownload')} value={formatNumber(props.result.android?.content.missing_attachment_resource_count, t)} />
        <MetricRow label={t('companion.sync.diagnostics.attachmentBytesToDownload')} value={formatBytes(props.result.android?.content.missing_attachment_resource_bytes, t)} />
        <MetricRow label={t('companion.sync.diagnostics.currentTopic')} value={formatActiveTopicBodyStatus(props.result, t)} wrap />
        <MetricRow label={t('companion.sync.diagnostics.latestSync')} value={formatEvent(latestAndroidEvent, t)} wrap />
      </div>
    </section>
  );
}
