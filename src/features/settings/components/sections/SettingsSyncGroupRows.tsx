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
import { displaySyncGroupPlatform } from '../../../../../lib/platform/syncGroupPlatform';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow
} from '../../../../shared/ui';

import { SettingsSyncGroupDeviceRow } from './SettingsSyncGroupDeviceRow';
import { SettingsSyncGroupJoinRequests } from './SettingsSyncGroupJoinRequests';

function discoveryMessageKey(status: Exclude<SyncGroupDiscoverySnapshot['status'], 'stopped'>) {
  return `settings.companionSync.group.discovery.${status}` as const;
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
  if (discovery.status === 'stopped') return null;
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

function CurrentDeviceSummary(props: { device: { device_name: string; platform: string } }) {
  const t = useTranslation();
  return (
    <div aria-label={t('settings.companionSync.group.devices.title')}
      className="border-t border-settings-divider/65" role="list">
      <div className="flex min-h-14 items-baseline gap-2 py-2.5" role="listitem">
        <span className="truncate text-ui-md font-normal text-foreground">{props.device.device_name}</span>
        <span className="shrink-0 text-ui-sm text-muted-foreground">
          {displaySyncGroupPlatform(props.device.platform)}
        </span>
      </div>
    </div>
  );
}

function JoinCandidateRow(props: {
  candidate: DesktopSyncGroupJoinCandidatePayload;
  disabled: boolean;
  onRequestJoin(endpointUrl: string): void;
}) {
  const t = useTranslation();
  return (
    <div className="flex min-h-14 items-center justify-between gap-5 border-t border-settings-divider/65 py-2.5">
      <span className="truncate text-ui-md font-medium text-foreground">
        {t('settings.companionSync.group.named', { name: props.candidate.group_display_name })}
      </span>
      <button className="shrink-0 rounded-sm px-2 py-1 text-ui-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-45"
        disabled={props.disabled} onClick={() => props.onRequestJoin(props.candidate.endpoint_url)} type="button">
        {t('settings.companionSync.group.join')}
      </button>
    </div>
  );
}

function EmptySyncGroupRow(props: Parameters<typeof SettingsSyncGroupRows>[0]) {
  const t = useTranslation();
  const discovery = props.discovery ?? STOPPED_SYNC_GROUP_DISCOVERY;
  const groups = Array.from(new Map(props.candidates.map((candidate) => [candidate.group_id, candidate])).values());
  const hasDiscoveryStatus = groups.length === 0 && discovery.status !== 'stopped';
  const hasContent = Boolean(props.currentDevice || groups.length || hasDiscoveryStatus || props.joinRequest);
  return (
    <>
      <SettingsRow description={t('settings.companionSync.group.empty.description')}
        title={t('settings.companionSync.group.title')}>
        <SettingsControlSlot className="flex-wrap">
          <SettingsButton disabled={props.isBusy || discovery.status === 'searching'}
            loading={discovery.status === 'searching'} loadingLabel={t('companion.sync.discovery.searching')}
            onClick={props.onDiscover}>
            {t('settings.companionSync.group.find')}
          </SettingsButton>
          <SettingsButton disabled={props.isBusy} loading={props.isCreating} onClick={props.onCreate}>
            {t('settings.companionSync.group.create')}
          </SettingsButton>
        </SettingsControlSlot>
      </SettingsRow>
      {hasContent ? <div className="px-settings-panel-x">
        <div className="border-b border-settings-divider/65">
        {props.currentDevice ? <CurrentDeviceSummary device={props.currentDevice} /> : null}
        {groups.map((candidate) => (
          <JoinCandidateRow candidate={candidate} disabled={props.isBusy} key={candidate.group_id}
            onRequestJoin={props.onRequestJoin} />
        ))}
        {groups.length > 0 && !['results', 'searching', 'stopped'].includes(discovery.status) ? (
          <div className="border-t border-settings-divider/65 py-2.5 text-ui-sm text-muted-foreground">
            {t(discoveryMessageKey(discovery.status as Exclude<typeof discovery.status, 'stopped'>))}
          </div>
        ) : null}
        {hasDiscoveryStatus ? (
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
      </div> : null}
    </>
  );
}

type SettingsSyncGroupRowsProps = {
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
  onRemove(device: SyncGroupDevicePayload): void;
  onReject(id: string): void;
  onRequestJoin(endpointUrl: string): void;
  onTogglePause(): void;
  joinRequests: DesktopSyncGroupJoinRequestSummaryPayload[];
  syncEnabled: boolean;
  syncPaused: boolean;
  removingDeviceIds: string[];
  topologyRole: 'anchor' | 'member' | 'observing';
  topologyStatus: 'observing' | 'ready' | 'waiting_anchor' | 'incompatible' | 'sync_before_demote';
};

function topologyMessageKey(props: SettingsSyncGroupRowsProps) {
  return props.topologyStatus === 'ready'
    ? `settings.companionSync.group.topology.${props.topologyRole}` as const
    : `settings.companionSync.group.topology.${props.topologyStatus}` as const;
}

export function SettingsSyncGroupRows(props: SettingsSyncGroupRowsProps) {
  const t = useTranslation();
  if (!props.group) return <EmptySyncGroupRow {...props} />;
  const group = props.group;
  const groupHeadingId = `sync-group-${group.group_id}-heading`;
  const topologyKey = props.syncEnabled && !props.syncPaused ? topologyMessageKey(props) : null;
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
            {group.devices.filter((device) => device.state === 'active').map((device) => (
              <SettingsSyncGroupDeviceRow device={device} disabled={props.isBusy} group={group}
                key={device.device_identity_key} onRemove={props.onRemove}
                onTogglePause={props.onTogglePause} syncPaused={props.syncPaused}
                syncEnabled={props.syncEnabled}
                removing={props.removingDeviceIds.includes(device.device_identity_key)}
                topologyLabel={device.device_identity_key === group.local_device_identity_key
                  ? topologyKey ? t(topologyKey) : undefined : undefined} />
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
