import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

import { formatSyncResultMessage, isReportableSyncEvent } from './companionSyncActivityCopy';
import { formatCompanionSyncProgressSummary } from './companionSyncProgressSummary';

type Translate = ReturnType<typeof useTranslation>;

export function formatClock(timestamp: string | null, t?: Translate) {
  if (!timestamp) {
    return t ? t('companion.sync.never') : 'Never';
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', hour12: false, minute: '2-digit' });
}

export function resolveLastSyncRow(props: {
  lastSyncedAt: string | null;
  status: 'idle' | 'loading' | 'syncing';
  syncEvents: NativeCompanionSyncEvent[];
  syncProgress: CompanionDesktopSyncProgress | null;
  t: Translate;
}) {
  const latestEvent = props.syncEvents.find(isReportableSyncEvent) ?? null;
  const latestCompletedEvent = props.syncEvents.find((event) => event.status === 'completed' && isReportableSyncEvent(event)) ?? null;
  if (props.syncProgress) return progressRow(props.syncProgress, props.t);
  if (props.status === 'syncing') return defaultRow(props.t('companion.sync.pullingChanges'), props.t('companion.sync.syncing'), props.t);
  if (latestEvent?.status === 'failed') return defaultRow(props.t('companion.sync.attention.activity'), props.t('companion.sync.failed'), props.t, 'error');
  if (latestEvent?.status === 'skipped') {
    return defaultRow(formatStatusDetail(formatSyncResultMessage(latestEvent.message, props.t), props.t), formatClock(latestEvent.occurred_at, props.t), props.t);
  }
  return {
    detail: latestCompletedEvent ? formatLastSyncDetail(latestCompletedEvent, props.t) : props.t('companion.sync.noSyncYet'),
    label: props.t('companion.sync.lastSync'),
    value: formatClock(latestCompletedEvent?.occurred_at ?? null, props.t),
    valueTone: latestCompletedEvent ? 'success' as const : 'default' as const
  };
}

function progressRow(syncProgress: CompanionDesktopSyncProgress, t: Translate) {
  const progress = formatCompanionSyncProgressSummary(syncProgress, t);
  return {
    detail: progress.detail ?? t('companion.sync.pullingChanges'),
    label: progress.title,
    value: progress.status,
    valueTone: 'default' as const
  };
}

function defaultRow(detail: string, value: string, t: Translate, valueTone: 'default' | 'error' = 'default') {
  return {
    detail,
    label: t('companion.sync.lastSync'),
    value,
    valueTone
  };
}

function formatStatusDetail(message: string, t: Translate) {
  if (message.length > 140 || /\b(SQLITE_|while compiling|SELECT\s|json_extract)\b/i.test(message)) {
    return t('companion.sync.attention.activity');
  }
  return message;
}

function formatLastSyncDetail(event: NativeCompanionSyncEvent | null, t: Translate) {
  if (!event) {
    return t('companion.sync.noSyncYet');
  }
  return formatStatusDetail(formatSyncResultMessage(event.message, t), t);
}
