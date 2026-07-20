import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { inferSyncRunResult } from '../shared/platform/companionSyncActivityEvents';
import { AppEmptyState } from '../shared/ui';

import {
  formatSyncRunActivityMessage,
  isReportableSyncEvent
} from './companionSyncActivityCopy';
import { formatCompanionSyncProgressSummary } from './companionSyncProgressSummary';
import { formatClock } from './companionSyncStatusRows';

type Translate = ReturnType<typeof useTranslation>;

function formatActivityMessage(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[], t: Translate) {
  const message = formatSyncRunActivityMessage(event, laterEvents, t);
  if (message.length > 180 || /\b(SQLITE_|while compiling|SELECT\s|json_extract)\b/i.test(message)) {
    if (/^Sync retrying; (?:Device|Android) changes were not sent/.test(message)) {
      return t('companion.sync.attention.retryingPending');
    }
    if (/^Sync needs attention; (?:Device|Android) changes were not sent/.test(message)) {
      return t('companion.sync.attention.needsPending');
    }
    return t('companion.sync.attention.desktopDiagnostics');
  }
  return message;
}

function isSupersededLegacyFailure(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  return !event.kind && event.status === 'failed' && laterEvents.some((laterEvent) => (
    (laterEvent.status === 'completed' || laterEvent.status === 'skipped') &&
    laterEvent.endpoint_url === event.endpoint_url
  ));
}

function statusClass(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  if (isSupersededLegacyFailure(event, laterEvents)) return 'text-companion-text-secondary';
  const result = inferSyncRunResult(event);
  if (result === 'failed' || result === 'system_fault') return 'text-error';
  if (result === 'completed') return 'text-companion-accent';
  if (result === 'blocked' || result === 'retrying' || result === 'waiting') return 'text-foreground';
  return 'text-companion-text-secondary';
}

function activityFactKey(event: NativeCompanionSyncEvent) {
  return [
    event.endpoint_url ?? '',
    event.kind ?? 'legacy_event',
    inferSyncRunResult(event),
    event.message
  ].join('|');
}

function visibleActivityEvents(events: NativeCompanionSyncEvent[]) {
  const seenNeedsAttentionFacts = new Set<string>();
  return events.filter(isReportableSyncEvent).filter((event) => {
    if (!isDedupedAttentionResult(inferSyncRunResult(event))) return true;
    const key = activityFactKey(event);
    if (seenNeedsAttentionFacts.has(key)) return false;
    seenNeedsAttentionFacts.add(key);
    return true;
  });
}

function isDedupedAttentionResult(result: ReturnType<typeof inferSyncRunResult>) {
  return result === 'blocked' || result === 'retrying' || result === 'system_fault' || result === 'waiting';
}

function formatCurrentActivityMessage(progress: CompanionDesktopSyncProgress | null, t: Translate) {
  if (!progress) return t('companion.sync.activity.waitingProgress');
  const summary = formatCompanionSyncProgressSummary(progress, t);
  return [summary.title, summary.status, summary.detail].filter(Boolean).join('; ');
}

function CurrentSyncSection(props: { message: string | null }) {
  const t = useTranslation();
  if (!props.message) return null;
  return (
    <div className="border-b border-companion-divider py-4">
      <div className="mb-2 text-xs font-medium text-companion-text-secondary">{t('companion.sync.activity.current')}</div>
      <div className="grid grid-cols-[4.5rem_1fr] gap-3 text-sm leading-5">
        <span className="text-xs text-companion-text-secondary">{t('companion.sync.activity.now')}</span>
        <span className="text-foreground">{props.message}</span>
      </div>
    </div>
  );
}

function CompletedActivitySection(props: { currentMessage: string | null; events: NativeCompanionSyncEvent[] }) {
  const t = useTranslation();
  if (props.events.length === 0) {
    return (
      <div className={props.currentMessage ? 'py-4' : 'border-b border-companion-divider py-4'}>
        <div className="mb-2 text-xs font-medium text-companion-text-secondary">{t('companion.sync.activity.completed')}</div>
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.sync.activity.empty.description')}
          title={t('companion.sync.activity.empty.title')}
        />
      </div>
    );
  }
  const visibleEvents = props.events.slice(0, 100);
  const groupedEvents = groupActivityEvents(visibleEvents);
  return (
    <div className={props.currentMessage ? 'pt-4' : ''}>
      <div className="mb-1 text-xs font-medium text-companion-text-secondary">{t('companion.sync.activity.completed')}</div>
      {groupedEvents.map((group) => (
        <div key={group.key}>
          {group.label ? <div className="pt-4 text-xs font-medium text-companion-text-secondary">{group.label}</div> : null}
          {group.events.map(({ event, index }) => (
            <div className="grid grid-cols-[3.75rem_1fr] gap-3 border-b border-companion-divider py-3 text-sm leading-5" key={event.id}>
              <span className="text-xs text-companion-text-secondary">{formatClock(event.occurred_at, t)}</span>
              <span className={statusClass(event, visibleEvents.slice(0, index))}>
                {formatActivityMessage(event, visibleEvents.slice(0, index), t)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function groupActivityEvents(events: NativeCompanionSyncEvent[]) {
  const today = localDateKey(new Date());
  const groups: Array<{
    events: Array<{ event: NativeCompanionSyncEvent; index: number }>;
    key: string;
    label: string | null;
  }> = [];
  events.forEach((event, index) => {
    const date = new Date(event.occurred_at);
    const key = localDateKey(date);
    const latestGroup = groups.at(-1);
    if (!latestGroup || latestGroup.key !== key) {
      groups.push({ events: [], key, label: key === today ? null : formatDateGroupLabel(date) });
    }
    groups.at(-1)?.events.push({ event, index });
  });
  return groups;
}

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function formatDateGroupLabel(date: Date) {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString([], options);
}

export function CompanionSyncActivityPage(props: {
  events: NativeCompanionSyncEvent[];
  status: 'idle' | 'loading' | 'syncing';
  syncProgress: CompanionDesktopSyncProgress | null;
}) {
  const t = useTranslation();
  const visibleEvents = visibleActivityEvents(props.events);
  const currentMessage = props.status === 'syncing'
    ? formatCurrentActivityMessage(props.syncProgress, t)
    : null;
  return (
    <section className="border-t border-companion-divider">
      <CurrentSyncSection message={currentMessage} />
      <CompletedActivitySection currentMessage={currentMessage} events={visibleEvents} />
    </section>
  );
}
