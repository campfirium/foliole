import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import { isFullSyncCompletedEvent } from '../shared/platform/companionSyncEventSemantics';

import { CompanionSyncDiagnosticsPanel } from './CompanionSyncDiagnosticsPanel';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

function formatClock(timestamp: string | null) {
  if (!timestamp) {
    return 'Never';
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDeviceKind(deviceKind: string | null) {
  if (deviceKind === 'android-capacitor' || deviceKind === 'android') {
    return 'Android';
  }
  return deviceKind ?? 'Device';
}

function formatPairedDevice(pairingState: NativeCompanionPairingState) {
  const name = pairingState.device_name?.trim() || 'This device';
  return `${name} (${formatDeviceKind(pairingState.device_kind)})`;
}

function formatDeviceName(pairingState: NativeCompanionPairingState) {
  return pairingState.device_name?.trim() || 'This device';
}

function SettingsRow(props: {
  detail?: string;
  label: string;
  value: string;
  valueTone?: 'default' | 'error' | 'success';
}) {
  const valueClass = props.valueTone === 'error'
    ? 'text-error'
    : props.valueTone === 'success'
      ? 'text-companion-accent'
      : 'text-foreground';
  return (
    <div className="flex items-start justify-between gap-4 border-b border-companion-divider py-4 last:border-b-0">
      <span>
        <span className="block text-sm font-medium text-foreground">{props.label}</span>
        {props.detail ? <span className="mt-1 block text-xs leading-5 text-companion-text-secondary">{props.detail}</span> : null}
      </span>
      <span className={`max-w-44 shrink-0 text-right text-sm font-medium ${valueClass}`}>{props.value}</span>
    </div>
  );
}

function ChevronIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>;
}

function SettingsLinkRow(props: {
  detail?: string;
  label: string;
  onClick(): void;
  value: string;
}) {
  return (
    <button
      className="flex w-full items-start justify-between gap-4 border-b border-companion-divider py-4 text-left"
      onClick={props.onClick}
      type="button"
    >
      <span>
        <span className="block text-sm font-medium text-foreground">{props.label}</span>
        {props.detail ? <span className="mt-1 block text-xs leading-5 text-companion-text-secondary">{props.detail}</span> : null}
      </span>
      <span className="flex max-w-44 shrink-0 items-center gap-2 text-right text-sm font-medium text-foreground">
        <span>{props.value}</span>
        <span className="text-companion-text-secondary"><ChevronIcon /></span>
      </span>
    </button>
  );
}

function resolveLastSyncRow(props: {
  lastSyncedAt: string | null;
  status: 'idle' | 'loading' | 'syncing';
  syncEvents: NativeCompanionSyncEvent[];
}) {
  const latestEvent = props.syncEvents[0] ?? null;
  const latestCompletedEvent = props.syncEvents.find(isFullSyncCompletedEvent) ?? null;
  if (props.status === 'syncing') {
    return {
      detail: 'Pulling changes now.',
      value: 'Syncing',
      valueTone: 'default' as const
    };
  }
  if (latestEvent?.status === 'failed') {
    return {
      detail: latestEvent.message,
      value: 'Failed',
      valueTone: 'error' as const
    };
  }
  if (latestEvent?.status === 'skipped') {
    return {
      detail: latestEvent.message,
      value: formatClock(latestEvent.occurred_at),
      valueTone: 'default' as const
    };
  }
  return {
    detail: props.lastSyncedAt ? formatLastCompletedDetail(latestCompletedEvent) : 'No finished sync pass yet',
    value: formatClock(props.lastSyncedAt),
    valueTone: props.lastSyncedAt ? 'success' as const : 'default' as const
  };
}

function formatLastCompletedDetail(event: NativeCompanionSyncEvent | null) {
  return event ? 'All sync stages completed' : 'Full sync confirmation recorded';
}

function formatEventStatus(event: NativeCompanionSyncEvent) {
  if (event.status === 'completed') {
    return isFullSyncCompletedEvent(event) ? 'Fully synced' : 'Legacy pass';
  }
  if (event.status === 'failed') {
    return 'Failed';
  }
  if (event.status === 'skipped') {
    return 'Checked';
  }
  return 'Started';
}

function formatActivityMessage(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  if (event.status === 'completed') {
    return isFullSyncCompletedEvent(event)
      ? 'All sync stages completed'
      : 'Legacy sync pass finished';
  }
  if (event.status === 'started' && event.message === 'Auto sync started.') {
    return 'Started auto sync';
  }
  if (event.status === 'failed') {
    return isSupersededFailure(event, laterEvents)
      ? 'Earlier sync attempt did not complete'
      : 'Sync did not complete';
  }
  if (event.status === 'skipped') {
    return event.message;
  }
  return `${formatEventStatus(event)} ${event.message}`;
}

function isSupersededFailure(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  return event.status === 'failed' && laterEvents.some((laterEvent) => (
    (laterEvent.status === 'completed' || laterEvent.status === 'skipped') &&
    laterEvent.endpoint_url === event.endpoint_url
  ));
}

function statusClass(event: NativeCompanionSyncEvent, laterEvents: NativeCompanionSyncEvent[]) {
  if (event.status === 'failed' && !isSupersededFailure(event, laterEvents)) {
    return 'text-error';
  }
  if (isFullSyncCompletedEvent(event)) {
    return 'text-companion-accent';
  }
  return 'text-companion-text-secondary';
}

function SyncActivitySummary(props: {
  events: NativeCompanionSyncEvent[];
  onOpen(): void;
}) {
  const latestEvent = props.events[0] ?? null;
  const summary = latestEvent
    ? `${formatEventStatus(latestEvent)} ${formatClock(latestEvent.occurred_at)}`
    : 'No activity';
  return (
    <SettingsLinkRow detail="Sync history" label="Activity" onClick={props.onOpen} value={summary} />
  );
}

function ActivityPage(props: { events: NativeCompanionSyncEvent[] }) {
  return (
    <section className="border-t border-companion-divider">
      {props.events.length === 0 ? (
        <p className="border-b border-companion-divider py-4 text-sm leading-6 text-companion-text-secondary">
          No sync activity yet.
        </p>
      ) : props.events.slice(0, 20).map((event, index, visibleEvents) => (
        <div className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-companion-divider py-3 text-sm leading-5" key={event.id}>
          <span className="text-xs text-companion-text-secondary">{formatClock(event.occurred_at)}</span>
          <span className={statusClass(event, visibleEvents.slice(0, index))}>
            {formatActivityMessage(event, visibleEvents.slice(0, index))}
          </span>
        </div>
      ))}
    </section>
  );
}

function ConnectionSummary(props: {
  onOpen(): void;
  pairingState: NativeCompanionPairingState;
}) {
  return (
    <SettingsLinkRow
      detail="Paired desktop details"
      label="Connection"
      onClick={props.onOpen}
      value={formatDeviceName(props.pairingState)}
    />
  );
}

function ConnectionPage(props: {
  endpointUrl: string;
  pairingState: NativeCompanionPairingState;
}) {
  return (
    <section className="border-t border-companion-divider">
      <SettingsRow label="Paired device" value={formatPairedDevice(props.pairingState)} />
      <SettingsRow label="Desktop address" value={props.endpointUrl} />
    </section>
  );
}

export function CompanionSyncStatusDetails(props: {
  endpointUrl: string;
  lastSyncedAt: string | null;
  pairingState: NativeCompanionPairingState;
  syncedTopicCount: number;
  syncConflictCount: number;
  syncEvents: NativeCompanionSyncEvent[];
  status: 'idle' | 'loading' | 'syncing';
  page: CompanionSettingsPage;
  onOpenPage(page: CompanionSettingsPage): void;
}) {
  if (props.page === 'syncActivity') {
    return <ActivityPage events={props.syncEvents} />;
  }
  if (props.page === 'syncConnection') {
    return <ConnectionPage endpointUrl={props.endpointUrl} pairingState={props.pairingState} />;
  }
  if (props.page === 'syncDiagnostics') {
    return <CompanionSyncDiagnosticsPanel endpointUrl={props.endpointUrl} />;
  }

  const lastSync = resolveLastSyncRow(props);
  const topicValue = props.syncedTopicCount > 0
    ? `${props.syncedTopicCount}`
    : 'No topics synced';
  return (
    <div className="border-t border-companion-divider">
      <SettingsRow
        detail={lastSync.detail}
        label="Last sync"
        value={lastSync.value}
        valueTone={lastSync.valueTone}
      />
      <SettingsRow label="Topics on this device" value={topicValue} />
      {props.syncConflictCount > 0 ? (
        <SettingsRow label="Issues to resolve" value={`${props.syncConflictCount}`} valueTone="error" />
      ) : null}
      <ConnectionSummary
        pairingState={props.pairingState}
        onOpen={() => props.onOpenPage('syncConnection')}
      />
      <SyncActivitySummary events={props.syncEvents} onOpen={() => props.onOpenPage('syncActivity')} />
      <SettingsLinkRow
        detail="Current connection and topic status"
        label="Sync check"
        onClick={() => props.onOpenPage('syncDiagnostics')}
        value="Run"
      />
    </div>
  );
}
