import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import {
  inferSyncRunResult,
  isSyncRunFinishedEvent
} from '../shared/platform/companionSyncActivityEvents';

export function formatSyncResultMessage(message: string) {
  const displayMessage = stripDiagnosticSuffixes(message);
  if (isSyncCheckOnlyMessage(displayMessage)) {
    return 'No changes to sync.';
  }
  if (displayMessage.startsWith('Sync fully completed; ')) {
    return capitalizeFirst(displayMessage.replace('Sync fully completed; ', '').replace(/\.$/, '.'));
  }
  if (displayMessage.startsWith('Sync made progress; ')) {
    return capitalizeFirst(displayMessage.replace('Sync made progress; ', '').replace(/\.$/, '.'));
  }
  if (displayMessage.startsWith('Sync checked; ')) {
    return capitalizeFirst(displayMessage.replace('Sync checked; ', '').replace(/\.$/, '.'));
  }
  return displayMessage;
}

export function isSyncCheckOnlyMessage(message: string) {
  const displayMessage = stripDiagnosticSuffixes(message);
  return displayMessage === 'Sync checked' ||
    displayMessage === 'Auto sync completed.' ||
    displayMessage === 'Sync fully completed.';
}

export function isReportableSyncEvent(event: { message: string; status: string }) {
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

export function formatSyncRunActivityMessage(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  if (!isSyncRunFinishedEvent(event)) return event.message;
  if (!event.kind || event.kind === 'legacy_event') return formatLegacyActivityMessage(event, laterEvents);
  const summaryMessage = formatSummaryActivityMessage(event);
  if (summaryMessage) return summaryMessage;
  const detail = formatSyncResultMessage(event.message);
  const result = inferSyncRunResult(event);
  if (result === 'completed') return `Sync completed${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  if (result === 'partial') return `Sync made progress${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  if (result === 'blocked') return formatLegacyBlockedActivityMessage(detail);
  if (result === 'retrying') return `Sync retrying${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  if (result === 'waiting') return `Sync waiting${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  if (result === 'system_fault') return `System issue${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  if (result === 'cancelled') return `Sync cancelled${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  return `Sync failed; ${event.message}`;
}

function formatSummaryActivityMessage(event: NativeCompanionSyncEvent) {
  const summary = event.summary;
  if (!summary) return null;
  const duration = formatDuration(summary.duration_ms);
  const durationSuffix = duration ? ` in ${duration}` : '';
  if (event.result === 'completed') {
    return summary.change_count > 0
      ? `Synced ${formatChangeCount(summary.change_count)}${durationSuffix}`
      : `No changes, checked${durationSuffix}`;
  }
  if ((summary.desktop_review_count ?? 0) > 0) {
    return `${formatChangeCount(summary.desktop_review_count ?? 0)} need desktop review`;
  }
  if ((summary.waiting_confirmation_count ?? 0) > 0) {
    return `${formatChangeCount(summary.waiting_confirmation_count ?? 0)} waiting for desktop confirmation`;
  }
  if ((summary.waiting_send_count ?? 0) > 0) {
    return `${formatChangeCount(summary.waiting_send_count ?? 0)} waiting to send`;
  }
  if (event.result === 'partial' && summary.change_count > 0) {
    return `Synced ${formatChangeCount(summary.change_count)}${durationSuffix}`;
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

function formatLegacyBlockedActivityMessage(detail: string) {
  if (detail === 'No changes to sync.') return 'Device changes were not sent.';
  if (detail.includes('need review before sending')) {
    return `Device changes were not sent; ${detail.replace(/\bneed review before sending\b/g, 'need desktop conflict review')}`;
  }
  return `Sync needs attention; ${detail}`;
}

function formatLegacyActivityMessage(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  if (event.status === 'completed') return formatSyncResultMessage(event.message);
  if (event.status === 'failed') return isLegacySupersededFailure(event, laterEvents)
    ? `Earlier issue: ${event.message}`
    : event.message;
  if (event.status === 'skipped') return formatSyncResultMessage(event.message);
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
