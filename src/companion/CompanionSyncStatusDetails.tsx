import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isFullSyncCompletedEvent } from '../shared/platform/companionSyncEventSemantics';

import { isReportableSyncEvent } from './companionSyncActivityCopy';
import { CompanionSyncActivityPage } from './CompanionSyncActivityPage';
import { formatClock, resolveLastSyncRow } from './companionSyncStatusRows';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

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

function formatEventStatus(event: NativeCompanionSyncEvent) {
  if (event.status === 'completed') {
    return isFullSyncCompletedEvent(event) ? 'Synced' : 'Checked';
  }
  if (event.status === 'failed') {
    return 'Failed';
  }
  if (event.status === 'skipped') {
    return 'Checked';
  }
  return 'Started';
}

function SyncActivitySummary(props: {
  events: NativeCompanionSyncEvent[];
  onOpen(): void;
}) {
  const latestEvent = props.events.find(isReportableSyncEvent) ?? null;
  const summary = latestEvent
    ? `${formatEventStatus(latestEvent)} ${formatClock(latestEvent.occurred_at)}`
    : 'No activity';
  return (
    <SettingsLinkRow detail="Sync history" label="Activity" onClick={props.onOpen} value={summary} />
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
  syncConflictCount: number;
  syncEvents: NativeCompanionSyncEvent[];
  syncProgress: CompanionDesktopSyncProgress | null;
  status: 'idle' | 'loading' | 'syncing';
  page: CompanionSettingsPage;
  onOpenPage(page: CompanionSettingsPage): void;
}) {
  if (props.page === 'syncActivity') {
    return <CompanionSyncActivityPage events={props.syncEvents} status={props.status} syncProgress={props.syncProgress} />;
  }
  if (props.page === 'syncConnection') {
    return <ConnectionPage endpointUrl={props.endpointUrl} pairingState={props.pairingState} />;
  }

  const lastSync = resolveLastSyncRow(props);
  return (
    <div className="border-t border-companion-divider">
      <SettingsRow
        detail={lastSync.detail}
        label={lastSync.label}
        value={lastSync.value}
        valueTone={lastSync.valueTone}
      />
      {props.syncConflictCount > 0 ? (
        <SettingsRow label="Issues to resolve" value={`${props.syncConflictCount}`} valueTone="error" />
      ) : null}
      <SettingsRow
        detail="External sources follow the current primary device."
        label="Device role"
        value={
          props.pairingState.device_id && props.pairingState.primary_device_id === props.pairingState.device_id
            ? 'Primary device'
            : 'Secondary device'
        }
      />
      <SettingsRow
        detail="Device id currently responsible for sync authority."
        label="Current primary"
        value={props.pairingState.primary_device_id ?? 'Unavailable'}
      />
      <ConnectionSummary
        pairingState={props.pairingState}
        onOpen={() => props.onOpenPage('syncConnection')}
      />
      <SyncActivitySummary events={props.syncEvents} onOpen={() => props.onOpenPage('syncActivity')} />
    </div>
  );
}
