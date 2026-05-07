import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isFullSyncCompletedEvent } from '../shared/platform/companionSyncEventSemantics';

import { formatSyncResultMessage, isReportableSyncEvent } from './companionSyncActivityCopy';
import { formatCompanionSyncProgressSummary } from './companionSyncProgressSummary';
import { formatClock } from './companionSyncStatusRows';

function formatActivityMessage(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  if (event.status === 'completed') return formatSyncResultMessage(event.message);
  if (event.status === 'failed') return isSupersededFailure(event, laterEvents)
    ? `Earlier issue: ${event.message}`
    : event.message;
  if (event.status === 'skipped') return formatSyncResultMessage(event.message);
  return event.message;
}

function isSupersededFailure(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  return event.status === 'failed' && laterEvents.some((laterEvent) => (
    (laterEvent.status === 'completed' || laterEvent.status === 'skipped') &&
    laterEvent.endpoint_url === event.endpoint_url
  ));
}

function statusClass(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  if (event.status === 'failed' && !isSupersededFailure(event, laterEvents)) return 'text-error';
  if (isFullSyncCompletedEvent(event)) return 'text-companion-accent';
  return 'text-companion-text-secondary';
}

function formatCurrentActivityMessage(progress: CompanionDesktopSyncProgress | null) {
  if (!progress) return 'Syncing; waiting for the next progress update.';
  const summary = formatCompanionSyncProgressSummary(progress);
  return [summary.title, summary.status, summary.detail].filter(Boolean).join('; ');
}

export function CompanionSyncActivityPage(props: {
  events: NativeCompanionSyncEvent[];
  status: 'idle' | 'loading' | 'syncing';
  syncProgress: CompanionDesktopSyncProgress | null;
}) {
  const visibleEvents = props.events.filter(isReportableSyncEvent);
  const currentMessage = props.status === 'syncing'
    ? formatCurrentActivityMessage(props.syncProgress)
    : null;
  return (
    <section className="border-t border-companion-divider">
      {currentMessage ? (
        <div className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-companion-divider py-3 text-sm leading-5">
          <span className="text-xs text-companion-text-secondary">Now</span>
          <span className="text-foreground">{currentMessage}</span>
        </div>
      ) : null}
      {visibleEvents.length === 0 && !currentMessage ? (
        <p className="border-b border-companion-divider py-4 text-sm leading-6 text-companion-text-secondary">
          No sync activity yet.
        </p>
      ) : visibleEvents.slice(0, 20).map((event, index, mappedEvents) => (
        <div className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-companion-divider py-3 text-sm leading-5" key={event.id}>
          <span className="text-xs text-companion-text-secondary">{formatClock(event.occurred_at)}</span>
          <span className={statusClass(event, mappedEvents.slice(0, index))}>
            {formatActivityMessage(event, mappedEvents.slice(0, index))}
          </span>
        </div>
      ))}
    </section>
  );
}
