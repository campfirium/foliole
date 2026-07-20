import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isFullSyncCompletedEvent } from '../shared/platform/companionSyncEventSemantics';

import { isReportableSyncEvent } from './companionSyncActivityCopy';
import { CompanionSyncActivityPage } from './CompanionSyncActivityPage';
import { formatClock, resolveLastSyncRow } from './companionSyncStatusRows';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

type Translate = ReturnType<typeof useTranslation>;
type SyncStatusDetailsProps = {
  endpointUrl: string;
  lastSyncedAt: string | null;
  pairingState: NativeCompanionPairingState;
  syncConflictCount: number;
  syncEvents: NativeCompanionSyncEvent[];
  syncProgress: CompanionDesktopSyncProgress | null;
  status: 'idle' | 'loading' | 'syncing';
  page: CompanionSettingsPage;
  onDisconnectPairing?: (() => void) | undefined;
  onOpenPage(page: CompanionSettingsPage): void;
};

function formatDeviceKind(deviceKind: string | null, t: Translate) {
  if (deviceKind === 'android-capacitor' || deviceKind === 'android') {
    return 'Android';
  }
  if (deviceKind === 'ios-capacitor' || deviceKind === 'ios') {
    return 'iOS';
  }
  return deviceKind ?? t('companion.sync.deviceFallback');
}

function formatPairedDevice(pairingState: NativeCompanionPairingState, t: Translate) {
  const name = pairingState.device_name?.trim() || t('companion.sync.thisDevice');
  return `${name} (${formatDeviceKind(pairingState.device_kind, t)})`;
}

function formatDeviceName(pairingState: NativeCompanionPairingState, t: Translate) {
  return pairingState.device_name?.trim() || t('companion.sync.thisDevice');
}

function formatDeviceId(deviceId: string | null, t: Translate) {
  if (!deviceId) return t('companion.sync.unavailable');
  if (deviceId.length <= 18) return deviceId;
  return `${deviceId.slice(0, 11)}...${deviceId.slice(-4)}`;
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
    <div className="rounded-xl bg-companion-content px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold leading-5 text-foreground">{props.label}</span>
        <span className={`max-w-[52%] shrink-0 break-words text-right text-sm font-semibold leading-5 ${valueClass}`}>
          {props.value}
        </span>
      </div>
      {props.detail ? (
        <span className="mt-2 block text-sm leading-6 text-companion-text-secondary">{props.detail}</span>
      ) : null}
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
      className="w-full rounded-xl bg-companion-content px-4 py-3 text-left transition active:bg-companion-subtle/80"
      onClick={props.onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold leading-5 text-foreground">{props.label}</span>
        <span className="flex max-w-[52%] shrink-0 items-center justify-end gap-1 text-right text-sm font-semibold leading-5 text-foreground">
          <span className="min-w-0 break-words">{props.value}</span>
          <span className="text-companion-text-secondary"><ChevronIcon /></span>
        </span>
      </div>
      {props.detail ? (
        <span className="mt-2 block text-sm leading-6 text-companion-text-secondary">{props.detail}</span>
      ) : null}
    </button>
  );
}

function formatEventStatus(event: NativeCompanionSyncEvent, t: Translate) {
  if (event.status === 'completed') {
    return isFullSyncCompletedEvent(event) ? t('companion.sync.synced') : t('companion.sync.checked');
  }
  if (event.status === 'failed') {
    return t('companion.sync.failed');
  }
  if (event.status === 'skipped') {
    return t('companion.sync.checked');
  }
  return t('companion.sync.started');
}

function SyncActivitySummary(props: {
  events: NativeCompanionSyncEvent[];
  onOpen(): void;
}) {
  const t = useTranslation();
  const latestEvent = props.events.find(isReportableSyncEvent) ?? null;
  const summary = latestEvent
    ? `${formatEventStatus(latestEvent, t)} ${formatClock(latestEvent.occurred_at, t)}`
    : t('companion.sync.noActivity');
  return (
    <SettingsLinkRow detail={t('companion.sync.activity.detail')} label={t('companion.sync.activity.row')} onClick={props.onOpen} value={summary} />
  );
}

function ConnectionSummary(props: {
  onOpen(): void;
  pairingState: NativeCompanionPairingState;
}) {
  const t = useTranslation();
  return (
    <SettingsLinkRow
      detail={t('companion.sync.connection.detail')}
      label={t('companion.sync.connection.row')}
      onClick={props.onOpen}
      value={formatDeviceName(props.pairingState, t)}
    />
  );
}

function ConnectionPage(props: {
  endpointUrl: string;
  isDisconnecting: boolean;
  onDisconnectPairing(): void;
  pairingState: NativeCompanionPairingState;
}) {
  const t = useTranslation();
  return (
    <section className="border-t border-companion-divider">
      <SettingsRow label={t('companion.sync.pairedDevice')} value={formatPairedDevice(props.pairingState, t)} />
      <SettingsRow label={t('companion.sync.desktopAddress')} value={props.endpointUrl} />
      <div className="py-4">
        <p className="text-xs leading-5 text-companion-text-secondary">
          {t('companion.sync.disconnect.description')}
        </p>
        <button
          className="mt-3 w-full rounded-2xl border border-error px-4 py-3 text-sm font-semibold text-error transition active:bg-companion-subtle/80 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={props.isDisconnecting}
          onClick={props.onDisconnectPairing}
          type="button"
        >
          {props.isDisconnecting ? t('companion.sync.disconnect.progress') : t('companion.sync.disconnect.button')}
        </button>
      </div>
    </section>
  );
}

function SyncOverview(props: SyncStatusDetailsProps) {
  const t = useTranslation();
  const lastSync = resolveLastSyncRow({ ...props, t });
  return (
    <div className="space-y-3">
      <SettingsRow
        detail={lastSync.detail}
        label={lastSync.label}
        value={lastSync.value}
        valueTone={lastSync.valueTone}
      />
      {props.syncConflictCount > 0 ? (
        <SettingsRow label={t('companion.sync.issuesToResolve')} value={`${props.syncConflictCount}`} valueTone="error" />
      ) : null}
      <SettingsRow
        detail={t('companion.sync.deviceRole.detail')}
        label={t('companion.sync.deviceRole')}
        value={
          props.pairingState.device_id && props.pairingState.primary_device_id === props.pairingState.device_id
            ? t('companion.sync.primaryDevice')
            : t('companion.sync.secondaryDevice')
        }
      />
      <SettingsRow
        detail={t('companion.sync.currentPrimary.detail')}
        label={t('companion.sync.currentPrimary')}
        value={formatDeviceId(props.pairingState.primary_device_id, t)}
      />
      <ConnectionSummary
        pairingState={props.pairingState}
        onOpen={() => props.onOpenPage('syncConnection')}
      />
      <SyncActivitySummary events={props.syncEvents} onOpen={() => props.onOpenPage('syncActivity')} />
    </div>
  );
}

export function CompanionSyncStatusDetails(props: SyncStatusDetailsProps) {
  if (props.page === 'syncActivity') {
    return <CompanionSyncActivityPage events={props.syncEvents} status={props.status} syncProgress={props.syncProgress} />;
  }
  if (props.page === 'syncConnection') {
    return (
      <ConnectionPage
        endpointUrl={props.endpointUrl}
        isDisconnecting={false}
        pairingState={props.pairingState}
        onDisconnectPairing={() => props.onDisconnectPairing?.()}
      />
    );
  }

  return <SyncOverview {...props} />;
}
