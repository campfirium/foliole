import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  inferSyncRunResult,
  isSyncRunFinishedEvent
} from '../shared/platform/companionSyncActivityEvents';

type Translate = ReturnType<typeof useTranslation>;

export function formatSyncResultMessage(message: string, t: Translate) {
  const displayMessage = stripDiagnosticSuffixes(message);
  if (isSyncCheckOnlyMessage(displayMessage)) {
    return t('companion.sync.activity.noChanges');
  }
  if (displayMessage.startsWith('Sync fully completed; ')) {
    return formatSyncDetail(displayMessage.replace('Sync fully completed; ', ''), t);
  }
  if (displayMessage.startsWith('Sync made progress; ')) {
    return formatSyncDetail(displayMessage.replace('Sync made progress; ', ''), t);
  }
  if (displayMessage.startsWith('Sync checked; ')) {
    return formatSyncDetail(displayMessage.replace('Sync checked; ', ''), t);
  }
  return displayMessage;
}

export function isSyncCheckOnlyMessage(message: string) {
  const displayMessage = stripDiagnosticSuffixes(message);
  return displayMessage === 'Sync checked' ||
    displayMessage === 'Auto sync completed.' ||
    displayMessage === 'Sync fully completed.';
}

type ReportableSyncEventInput = Pick<NativeCompanionSyncEvent, 'message' | 'status'> &
  Partial<Pick<NativeCompanionSyncEvent, 'kind'>>;

export function isReportableSyncEvent(event: ReportableSyncEventInput) {
  if ('kind' in event && (event.kind === 'run_started' || event.kind === 'diagnostic')) {
    return false;
  }
  if ('kind' in event && event.kind === 'run_finished') {
    return !isSyncCheckOnlyMessage(event.message);
  }
  if ('kind' in event && event.kind && event.kind !== 'legacy_event') {
    return false;
  }
  if (event.status === 'started') {
    return false;
  }
  return !(event.status === 'completed' && isSyncCheckOnlyMessage(event.message));
}

export function formatSyncRunActivityMessage(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[], t: Translate) {
  if (!isSyncRunFinishedEvent(event)) return event.message;
  if (!event.kind || event.kind === 'legacy_event') return formatLegacyActivityMessage(event, laterEvents, t);
  const summaryMessage = formatSummaryActivityMessage(event, t);
  if (summaryMessage) return summaryMessage;
  const detail = formatSyncResultMessage(event.message, t);
  const result = inferSyncRunResult(event);
  if (result === 'completed') return withOptionalDetail(t('companion.sync.activity.completedRun'), detail, t);
  if (result === 'partial') return withOptionalDetail(t('companion.sync.activity.madeProgress'), detail, t);
  if (result === 'blocked') return formatLegacyBlockedActivityMessage(detail, t);
  if (result === 'retrying') return withOptionalDetail(t('companion.sync.activity.retrying'), detail, t);
  if (result === 'waiting') return withOptionalDetail(t('companion.sync.activity.waiting'), detail, t);
  if (result === 'system_fault') return withOptionalDetail(t('companion.sync.activity.systemIssue'), detail, t);
  if (result === 'cancelled') return withOptionalDetail(t('companion.sync.activity.cancelled'), detail, t);
  return t('companion.sync.activity.failedWithDetail', { detail: event.message });
}

function formatSummaryActivityMessage(event: NativeCompanionSyncEvent, t?: Translate) {
  const summary = event.summary;
  if (!summary) return null;
  const duration = formatDuration(summary.duration_ms);
  const durationSuffix = duration && t ? t('companion.sync.activity.inDuration', { duration }) : duration ? ` in ${duration}` : '';
  if (event.result === 'completed') {
    return summary.change_count > 0
      ? (t ? t('companion.sync.activity.syncedChanges', { count: summary.change_count, duration: durationSuffix }) : `Synced ${formatChangeCount(summary.change_count)}${durationSuffix}`)
      : (t ? t('companion.sync.activity.noChangesChecked', { duration: durationSuffix }) : `No changes, checked${durationSuffix}`);
  }
  if ((summary.desktop_review_count ?? 0) > 0) {
    return t ? t('companion.sync.activity.needDesktopReview', { count: summary.desktop_review_count ?? 0 }) : `${formatChangeCount(summary.desktop_review_count ?? 0)} need desktop review`;
  }
  if ((summary.waiting_confirmation_count ?? 0) > 0) {
    return t ? t('companion.sync.activity.waitingDesktopConfirmation', { count: summary.waiting_confirmation_count ?? 0 }) : `${formatChangeCount(summary.waiting_confirmation_count ?? 0)} waiting for desktop confirmation`;
  }
  if ((summary.waiting_send_count ?? 0) > 0) {
    return t ? t('companion.sync.activity.waitingToSend', { count: summary.waiting_send_count ?? 0 }) : `${formatChangeCount(summary.waiting_send_count ?? 0)} waiting to send`;
  }
  if (event.result === 'partial' && summary.change_count > 0) {
    return t ? t('companion.sync.activity.syncedChanges', { count: summary.change_count, duration: durationSuffix }) : `Synced ${formatChangeCount(summary.change_count)}${durationSuffix}`;
  }
  return null;
}

function formatChangeCount(count: number) {
  return `${count} ${count === 1 ? 'change' : 'changes'}`;
}

function formatDuration(durationMs: number | undefined) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1000) return `${(durationMs / 1000).toFixed(1)}s`;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatLegacyBlockedActivityMessage(detail: string, t: Translate) {
  if (detail === t('companion.sync.activity.noChanges')) return t('companion.sync.activity.deviceChangesNotSent');
  if (detail.includes('need review before sending')) {
    const count = Number.parseInt(detail.match(/\b(\d+)\b/)?.[1] ?? '0', 10);
    return t('companion.sync.activity.deviceChangesNeedReview', { count: Number.isFinite(count) && count > 0 ? count : 1 });
  }
  return t('companion.sync.activity.needsAttentionWithDetail', { detail });
}

function formatLegacyActivityMessage(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[], t: Translate) {
  if (event.status === 'completed') return formatSyncResultMessage(event.message, t);
  if (event.status === 'failed') return isLegacySupersededFailure(event, laterEvents)
    ? t('companion.sync.activity.earlierIssue', { detail: event.message })
    : event.message;
  if (event.status === 'skipped') return formatSyncResultMessage(event.message, t);
  return event.message;
}

function isLegacySupersededFailure(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  return event.status === 'failed' && laterEvents.some((laterEvent) => (
    (laterEvent.status === 'completed' || laterEvent.status === 'skipped') &&
    laterEvent.endpoint_url === event.endpoint_url
  ));
}

function stripDiagnosticSuffixes(message: string) {
  return message
    .replace(/;\s*timing:.*$/i, '.')
    .replace(/;\s*body internals:.*$/i, '.');
}

function capitalizeFirst(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function withOptionalDetail(prefix: string, detail: string, t: Translate) {
  return detail === t('companion.sync.activity.noChanges') ? prefix : t('companion.sync.activity.withDetail', { detail, prefix });
}

function formatSyncDetail(detail: string, t: Translate) {
  const normalized = capitalizeFirst(detail.replace(/\.$/, '.'));
  const downloadedMatch = normalized.match(/^Downloaded (.+) in this sync(?: in (.+))?\.?$/);
  if (downloadedMatch) {
    const duration = downloadedMatch[2] ? t('companion.sync.activity.resource.duration', { duration: downloadedMatch[2] }) : '';
    return t('companion.sync.activity.resourceDownloaded', {
      detail: localizeResourcePhrase(downloadedMatch[1] ?? '', t),
      duration
    });
  }
  const backlogMatch = normalized.match(/^(.+) (left to download|still downloading)\.?$/);
  if (backlogMatch) {
    const key = backlogMatch[2] === 'still downloading'
      ? 'companion.sync.activity.resourceStillDownloading'
      : 'companion.sync.activity.resourceLeftToDownload';
    return t(key, { detail: localizeResourcePhrase(backlogMatch[1] ?? '', t) });
  }
  const failedEarlierMatch = normalized.match(/^(.+) failed earlier\.?$/);
  if (failedEarlierMatch) {
    return t('companion.sync.activity.resourceFailedEarlier', {
      detail: localizeResourcePhrase(failedEarlierMatch[1] ?? '', t)
    });
  }
  if (normalized === 'Resource backlog was not measured in this pass.') return t('companion.sync.activity.resourceBacklogNotMeasured');
  if (normalized === 'Resource downloads are still pending.') return t('companion.sync.activity.resourceDownloadsPending');
  if (normalized === 'Resource downloads made progress and will continue.') return t('companion.sync.activity.resourceDownloadsContinue');
  if (normalized === 'Topic list confirmation is still pending.') return t('companion.sync.activity.topicListPending');
  if (normalized === 'Android changes are still waiting to settle.') return t('companion.sync.activity.androidChangesWaiting');
  if (normalized === 'All stages completed.') return t('companion.sync.activity.allStagesCompleted');
  return normalized;
}

function localizeResourcePhrase(phrase: string, t: Translate) {
  return phrase
    .replace(/\bsome topic bodies\b/g, t('companion.sync.activity.resource.someTopicBodies'))
    .replace(/\bsome body downloads\b/g, t('companion.sync.activity.resource.someBodyDownloads'))
    .replace(/\bsome attachment files\b/g, t('companion.sync.activity.resource.someAttachmentFiles'))
    .replace(/\b(\d+) topic body\b/g, (_, count: string) => t('companion.sync.activity.resource.topicBody', { count }))
    .replace(/\b(\d+) topic bodies\b/g, (_, count: string) => t('companion.sync.activity.resource.topicBodies', { count }))
    .replace(/\b(\d+) external document body\b/g, (_, count: string) => t('companion.sync.activity.resource.externalDocumentBody', { count }))
    .replace(/\b(\d+) external document bodies\b/g, (_, count: string) => t('companion.sync.activity.resource.externalDocumentBodies', { count }))
    .replace(/\b(\d+) body download\b/g, (_, count: string) => t('companion.sync.activity.resource.bodyDownload', { count }))
    .replace(/\b(\d+) body downloads\b/g, (_, count: string) => t('companion.sync.activity.resource.bodyDownloads', { count }))
    .replace(/\b(\d+) attachment file\b/g, (_, count: string) => t('companion.sync.activity.resource.attachmentFile', { count }))
    .replace(/\b(\d+) attachment files\b/g, (_, count: string) => t('companion.sync.activity.resource.attachmentFiles', { count }))
    .replace(/\b(\d+) attachment download\b/g, (_, count: string) => t('companion.sync.activity.resource.attachmentDownload', { count }))
    .replace(/\b(\d+) attachment downloads\b/g, (_, count: string) => t('companion.sync.activity.resource.attachmentDownloads', { count }))
    .replace(/\sand\s/g, t('companion.sync.activity.resource.and'));
}
