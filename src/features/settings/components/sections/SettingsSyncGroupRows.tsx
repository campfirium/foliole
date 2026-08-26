import type {
  DesktopSyncGroupJoinRequestSummaryPayload,
  DesktopSyncGroupJoinCandidatePayload,
  DesktopSyncGroupJoinRequestPayload
} from '../../../../../lib/platform/nativeCompanionSyncContract';
import {
  resolveSyncGroupDisplayDeviceName,
  type SyncGroupDevicePayload,
  type SyncGroupPayload
} from '../../../../../lib/platform/syncGroupContract';
import type { SyncGroupDiscoverySnapshot } from '../../../../../lib/platform/syncGroupDiscoveryContract';
import { STOPPED_SYNC_GROUP_DISCOVERY } from '../../../../../lib/platform/syncGroupDiscoveryContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow
} from '../../../../shared/ui';

import { SettingsSyncGroupJoinRequests } from './SettingsSyncGroupJoinRequests';

const PLATFORM_LABELS: Record<string, string> = {
  android: 'Android',
  darwin: 'macOS',
  ios: 'iOS',
  linux: 'Linux',
  win32: 'Windows'
};

function platformFor(kind: string) {
  const key = Object.keys(PLATFORM_LABELS).find((candidate) => kind.toLowerCase().includes(candidate));
  return key ? PLATFORM_LABELS[key]! : kind;
}

function discoveryMessageKey(status: Exclude<SyncGroupDiscoverySnapshot['status'], 'stopped'>) {
  return `settings.companionSync.group.discovery.${status}` as const;
}

function DeviceRow(props: {
  disabled: boolean;
  device: SyncGroupDevicePayload;
  group: SyncGroupPayload;
  onTogglePause(): void;
  syncPaused: boolean;
}) {
  const t = useTranslation();
  const local = props.device.device_identity_key === props.group.local_device_identity_key;
  return (
    <div className="flex min-h-16 items-center justify-between gap-7 py-3.5" role="listitem">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-ui-md font-normal text-foreground">{props.device.device_name}</span>
        <span className="shrink-0 text-ui-sm text-muted-foreground">{platformFor(props.device.platform)}</span>
      </div>
      <button className="shrink-0 rounded-sm px-2 py-1 text-ui-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-45"
        disabled={props.disabled || !local} onClick={props.onTogglePause} type="button">
        {local ? t(props.syncPaused ? 'settings.companionSync.group.resume' : 'settings.companionSync.group.pause') : t('companion.sync.member.active')}
      </button>
    </div>
  );
}

function DiscoveryStatusRow(props: {
  discovery: SyncGroupDiscoverySnapshot;
  disabled: boolean;
  onDiscover(): void;
}) {
  const t = useTranslation();
  const { discovery } = props;
  if (discovery.status === 'searching') {
    return <span className="text-ui-sm text-muted-foreground">{t('settings.companionSync.group.discovery.searching')}</span>;
  }
  if (discovery.status === 'stopped') {
    return (
      <button className="rounded-sm py-1 text-ui-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-45"
        disabled={props.disabled} onClick={props.onDiscover} type="button">
        {t('settings.companionSync.group.find')}
      </button>
    );
  }
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-ui-sm text-muted-foreground">{t(discoveryMessageKey(discovery.status))}</span>
      <button className="shrink-0 rounded-sm py-1 text-ui-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={props.onDiscover} type="button">
        {t('settings.companionSync.group.discovery.retry')}
      </button>
    </div>
  );
}

function EmptySyncGroupRow(props: Parameters<typeof SettingsSyncGroupRows>[0]) {
  const t = useTranslation();
  const discovery = props.discovery ?? STOPPED_SYNC_GROUP_DISCOVERY;
  const groups = Array.from(new Map(props.candidates.map((candidate) => [candidate.group_id, candidate])).values());
  return (
    <div className="px-settings-panel-x pt-1">
      <div className="flex min-h-11 items-center justify-between gap-5">
        <h4 className="text-ui-md font-semibold text-foreground">{t('settings.companionSync.group.title')}</h4>
        <SettingsButton className="h-8" disabled={props.isBusy} loading={props.isCreating} onClick={props.onCreate}>
          {t('settings.companionSync.group.create')}
        </SettingsButton>
      </div>
      <div className="border-b border-settings-divider/65">
        {props.currentDevice ? (
          <div aria-label={t('settings.companionSync.group.devices.title')}
            className="border-t border-settings-divider/65" role="list">
            <div className="flex min-h-14 items-baseline gap-2 py-2.5" role="listitem">
              <span className="truncate text-ui-md font-normal text-foreground">
                {props.currentDevice.device_name}
              </span>
              <span className="shrink-0 text-ui-sm text-muted-foreground">
                {platformFor(props.currentDevice.platform)}
              </span>
            </div>
          </div>
        ) : null}
        {groups.map((candidate) => (
          <div className="flex min-h-14 items-center justify-between gap-5 border-t border-settings-divider/65 py-2.5"
            key={candidate.group_id}>
            <span className="truncate text-ui-md font-medium text-foreground">
              {t('settings.companionSync.group.named', { name: candidate.group_display_name })}
            </span>
            <button className="shrink-0 rounded-sm px-2 py-1 text-ui-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-45"
              disabled={props.isBusy} onClick={() => props.onRequestJoin(candidate.endpoint_url)} type="button">
              {t('settings.companionSync.group.join')}
            </button>
          </div>
        ))}
        {groups.length > 0 && !['results', 'searching', 'stopped'].includes(discovery.status) ? (
          <div className="border-t border-settings-divider/65 py-2.5 text-ui-sm text-muted-foreground">
            {t(discoveryMessageKey(discovery.status as Exclude<typeof discovery.status, 'stopped'>))}
          </div>
        ) : null}
        {groups.length === 0 ? (
          <div className="flex min-h-14 items-center border-t border-settings-divider/65 py-2.5">
            <DiscoveryStatusRow discovery={discovery} disabled={props.isBusy} onDiscover={props.onDiscover} />
          </div>
        ) : null}
        {props.joinRequest ? (
          <div className="border-t border-settings-divider/65 py-3 text-ui-sm text-muted-foreground">
            {t('settings.companionSync.group.join.waiting')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsSyncGroupRows(props: {
  candidates: DesktopSyncGroupJoinCandidatePayload[];
  discovery?: SyncGroupDiscoverySnapshot;
  currentDevice: { device_name: string; platform: string } | null;
  group: SyncGroupPayload | null;
  isBusy: boolean;
  isCreating: boolean;
  joinRequest: DesktopSyncGroupJoinRequestPayload | null;
  onAccept(id: string): void;
  onCreate(): void;
  onDiscover(): void;
  onLeave(): void;
  onReject(id: string): void;
  onRequestJoin(endpointUrl: string): void;
  onTogglePause(): void;
  joinRequests: DesktopSyncGroupJoinRequestSummaryPayload[];
  syncPaused: boolean;
}) {
  const t = useTranslation();
  if (!props.group) return <EmptySyncGroupRow {...props} />;
  const groupHeadingId = `sync-group-${props.group.group_id}-heading`;
  return (
    <>
      <div className="px-settings-panel-x pt-1">
        <div className="flex min-h-11 items-center">
          <h4 className="text-ui-md font-semibold text-foreground">{t('settings.companionSync.group.title')}</h4>
        </div>
        <section aria-labelledby={groupHeadingId} className="mt-5 border-b border-settings-divider/65 pb-5">
          <div className="flex min-h-12 items-center justify-between gap-7 pb-2">
            <h5 className="truncate text-ui-lg font-semibold text-foreground" id={groupHeadingId}>
              {t('settings.companionSync.group.named', { name: resolveSyncGroupDisplayDeviceName(props.group) })}
            </h5>
            <button className="shrink-0 rounded-sm px-2 py-1 text-ui-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-45"
              disabled={props.isBusy} onClick={props.onLeave} type="button">
              {t('settings.companionSync.group.leave')}
            </button>
          </div>
          <div aria-label={t('settings.companionSync.group.devices.title')}
            className="ml-5 divide-y divide-settings-divider/65 pl-5" role="list">
            {props.group.devices.filter((device) => device.state === 'active').map((device) => (
              <DeviceRow device={device} disabled={props.isBusy} group={props.group!} key={device.device_identity_key}
                onTogglePause={props.onTogglePause} syncPaused={props.syncPaused} />
            ))}
          </div>
        </section>
      </div>
      {props.joinRequests.length > 0 ? (
        <SettingsRow description={t('settings.companionSync.group.join.description')} title={t('settings.companionSync.group.join.title')}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <SettingsSyncGroupJoinRequests disabled={props.isBusy} onAccept={props.onAccept}
              onReject={props.onReject} requests={props.joinRequests} />
          </SettingsControlSlot>
        </SettingsRow>
      ) : null}
    </>
  );
}
