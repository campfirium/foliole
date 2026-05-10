import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isFullSyncCompletedEvent } from '../shared/platform/companionSyncEventSemantics';

import { isReportableSyncEvent } from './companionSyncActivityCopy';
import { CompanionSyncActivityPage } from './CompanionSyncActivityPage';
import { CompanionSyncConnectionPage, resolveDesktopDeviceInfo } from './CompanionSyncDevicesCard';
import { formatClock, resolveLastSyncRow } from './companionSyncStatusRows';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { CompanionDesktopDiscovery } from './useCompanionWorkspacePairing';

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

function ConnectionSummary(props: {
  desktopDiscovery: CompanionDesktopDiscovery | null;
  endpointUrl: string;
  onOpen(): void;
}) {
  const desktop = resolveDesktopDeviceInfo(props.endpointUrl, props.desktopDiscovery);
  return (
    <button
      className="flex w-full items-start justify-between gap-4 border-b border-companion-divider py-4 text-left"
      onClick={props.onOpen}
      type="button"
    >
      <span>
        <span className="block text-sm font-medium text-foreground">Connection</span>
        <span className="mt-1 block text-xs leading-5 text-companion-text-secondary">Paired desktop</span>
      </span>
      <span className="flex max-w-48 shrink-0 items-start gap-2 text-right">
        <span>
          <span className="block text-sm font-medium text-foreground">{desktop.name}</span>
          <span className="mt-1 block text-xs leading-5 text-companion-text-secondary">{desktop.detail}</span>
        </span>
        <span className="mt-0.5 text-companion-text-secondary"><ChevronIcon /></span>
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

export function CompanionSyncStatusDetails(props: {
  desktopDiscovery: CompanionDesktopDiscovery | null;
  endpointUrl: string;
  lastSyncedAt: string | null;
  onRequestPrimaryDeviceTakeover(endpointUrl: string): Promise<unknown>;
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
    const isPrimary = props.pairingState.device_id !== null && props.pairingState.primary_device_id === props.pairingState.device_id;
    return (
      <CompanionSyncConnectionPage
        desktopDiscovery={props.desktopDiscovery}
        endpointUrl={props.endpointUrl}
        isPrimary={isPrimary}
        isSyncing={props.status === 'syncing'}
        pairingState={props.pairingState}
        onSetPrimary={(endpointUrl) => void props.onRequestPrimaryDeviceTakeover(endpointUrl)}
      />
    );
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
      <ConnectionSummary
        desktopDiscovery={props.desktopDiscovery}
        endpointUrl={props.endpointUrl}
        onOpen={() => props.onOpenPage('syncConnection')}
      />
      <SyncActivitySummary events={props.syncEvents} onOpen={() => props.onOpenPage('syncActivity')} />
    </div>
  );
}
