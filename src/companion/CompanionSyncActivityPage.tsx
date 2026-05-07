import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { inferSyncRunResult } from '../shared/platform/companionSyncActivityEvents';

import {
  formatSyncRunActivityMessage,
  isReportableSyncEvent
} from './companionSyncActivityCopy';
import { formatCompanionSyncProgressSummary } from './companionSyncProgressSummary';
import { formatClock } from './companionSyncStatusRows';

function formatActivityMessage(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  return formatSyncRunActivityMessage(event, laterEvents);
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
  if (result === 'failed') return 'text-error';
  if (result === 'completed') return 'text-companion-accent';
  if (result === 'blocked') return 'text-foreground';
  return 'text-companion-text-secondary';
}

function formatCurrentActivityMessage(progress: CompanionDesktopSyncProgress | null) {
  if (!progress) return 'Syncing; waiting for the next progress update.';
  const summary = formatCompanionSyncProgressSummary(progress);
  return [summary.title, summary.status, summary.detail].filter(Boolean).join('; ');
}

function CurrentSyncSection(props: { message: string | null }) {
  if (!props.message) return null;
  return (
    <div className="border-b border-companion-divider py-4">
      <div className="mb-2 text-xs font-medium text-companion-text-secondary">Current sync</div>
      <div className="grid grid-cols-[4.5rem_1fr] gap-3 text-sm leading-5">
        <span className="text-xs text-companion-text-secondary">Now</span>
        <span className="text-foreground">{props.message}</span>
      </div>
    </div>
  );
}

function CompletedActivitySection(props: { currentMessage: string | null; events: NativeCompanionSyncEvent[] }) {
  if (props.events.length === 0) {
    return (
      <div className={props.currentMessage ? 'py-4' : 'border-b border-companion-divider py-4'}>
        <div className="mb-2 text-xs font-medium text-companion-text-secondary">Completed</div>
        <p className="text-sm leading-6 text-companion-text-secondary">No completed sync activity yet.</p>
      </div>
    );
  }
  return (
    <div className={props.currentMessage ? 'pt-4' : ''}>
      <div className="mb-1 text-xs font-medium text-companion-text-secondary">Completed</div>
      {props.events.slice(0, 20).map((event, index, mappedEvents) => (
        <div className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-companion-divider py-3 text-sm leading-5" key={event.id}>
          <span className="text-xs text-companion-text-secondary">{formatClock(event.occurred_at)}</span>
          <span className={statusClass(event, mappedEvents.slice(0, index))}>
            {formatActivityMessage(event, mappedEvents.slice(0, index))}
          </span>
        </div>
      ))}
    </div>
  );
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
      <CurrentSyncSection message={currentMessage} />
      <CompletedActivitySection currentMessage={currentMessage} events={visibleEvents} />
    </section>
  );
}
