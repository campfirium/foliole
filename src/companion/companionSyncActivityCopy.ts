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
  if ('kind' in event && event.kind === 'stage_finished') {
    return true;
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
  const detail = formatSyncResultMessage(event.message);
  const result = inferSyncRunResult(event);
  if (result === 'completed') return `Sync completed${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  if (result === 'partial') return `Sync made progress${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  if (result === 'blocked') return `Sync blocked${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  if (result === 'cancelled') return `Sync cancelled${detail === 'No changes to sync.' ? '' : `; ${detail}`}`;
  return `Sync failed; ${event.message}`;
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
