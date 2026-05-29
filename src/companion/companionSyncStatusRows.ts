import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

import { formatSyncResultMessage, isReportableSyncEvent } from './companionSyncActivityCopy';
import { formatCompanionSyncProgressSummary } from './companionSyncProgressSummary';

export function formatClock(timestamp: string | null) {
  if (!timestamp) {
    return 'Never';
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', hour12: false, minute: '2-digit' });
}

export function resolveLastSyncRow(props: {
  lastSyncedAt: string | null;
  status: 'idle' | 'loading' | 'syncing';
  syncEvents: NativeCompanionSyncEvent[];
  syncProgress: CompanionDesktopSyncProgress | null;
}) {
  const latestEvent = props.syncEvents.find(isReportableSyncEvent) ?? null;
  const latestCompletedEvent = props.syncEvents.find((event) => event.status === 'completed' && isReportableSyncEvent(event)) ?? null;
  if (props.syncProgress) return progressRow(props.syncProgress);
  if (props.status === 'syncing') return defaultRow('Pulling changes now.', 'Syncing');
  if (latestEvent?.status === 'failed') return defaultRow('Sync failed. Open Activity for details.', 'Failed', 'error');
  if (latestEvent?.status === 'skipped') return defaultRow(formatStatusDetail(latestEvent.message), formatClock(latestEvent.occurred_at));
  return {
    detail: latestCompletedEvent ? formatLastSyncDetail(latestCompletedEvent) : 'No sync yet',
    label: 'Last sync',
    value: formatClock(latestCompletedEvent?.occurred_at ?? null),
    valueTone: latestCompletedEvent ? 'success' as const : 'default' as const
  };
}

function progressRow(syncProgress: CompanionDesktopSyncProgress) {
  const progress = formatCompanionSyncProgressSummary(syncProgress);
  return {
    detail: progress.detail ?? 'Pulling changes now.',
    label: progress.title,
    value: progress.status,
    valueTone: 'default' as const
  };
}

function defaultRow(detail: string, value: string, valueTone: 'default' | 'error' = 'default') {
  return {
    detail,
    label: 'Last sync',
    value,
    valueTone
  };
}

function formatStatusDetail(message: string) {
  if (message.length > 140 || /\b(SQLITE_|while compiling|SELECT\s|json_extract)\b/i.test(message)) {
    return 'Sync needs attention. Open Activity for details.';
  }
  return message;
}

function formatLastSyncDetail(event: NativeCompanionSyncEvent | null) {
  if (!event) {
    return 'No sync yet';
  }
  return formatStatusDetail(formatSyncResultMessage(event.message));
}
