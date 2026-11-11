import { ChevronDown, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { DesktopSyncGroupOverviewPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupDevicePayload, SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { syncGroupDeviceDisplayName } from '../../../../../lib/platform/syncGroupRemovalModel';
import { WEB_DAV_USAGE_PERIOD_MINUTES, type WebDavUsagePeriod } from '../../../../../lib/platform/webDavRelayContract';
import { useLocalization, useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { enableDesktopWebDavRelay } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { useDesktopSyncGroup } from '../../../../shared/platform/useDesktopSyncGroup';
import {
  AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger,
  SettingsButton, SettingsControlSlot, SettingsRow, SettingsSection, SettingsSegmentedControl,
  requestAppConfirmation, settingsFieldClassName
} from '../../../../shared/ui';

import { SettingsWebDavAttachmentRow } from './SettingsWebDavAttachmentRow';
import { SettingsWebDavCredentialDelivery } from './SettingsWebDavCredentialDelivery';
import { SettingsWebDavLogButton } from './SettingsWebDavLogButton';
import { SettingsWebDavRelayRow } from './SettingsWebDavRelayRow';

const PREFIX = 'settings.companionSync.webdav' as const;
type Relay = NonNullable<DesktopSyncGroupOverviewPayload['webdav_relay']>;

function WebDavUsage({ relay, refresh }: { relay: Relay; refresh: () => Promise<unknown> }) {
  const { locale, t } = useLocalization();
  const [period, setPeriod] = useState<WebDavUsagePeriod>('tenMinutes');
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const usage = failed ? null : relay.usage;
  const totals = usage?.[period];
  const format = new Intl.NumberFormat(locale);

  async function refreshUsage() {
    setRefreshing(true);
    setFailed(false);
    try { await refresh(); }
    catch { setFailed(true); }
    finally { setRefreshing(false); }
  }

  return <SettingsSection title={t(`${PREFIX}.usage`)} description={t(`${PREFIX}.usageDescription`)}
    actions={<SettingsWebDavLogButton />}>
    <SettingsRow title={t(relay.configured ? `${PREFIX}.configured` : `${PREFIX}.unconfigured`)}
      description={<span aria-live="polite">{totals ?
        t(`${PREFIX}.usageTotals`, { requests: format.format(totals.requests),
          uploaded: format.format(totals.uploadedBytes), downloaded: format.format(totals.downloadedBytes) })
       : t(`${PREFIX}.usageUnavailable`)}</span>}>
      <SettingsControlSlot>
        <SettingsButton aria-label={t(`${PREFIX}.refreshUsage`)} title={t(`${PREFIX}.refreshUsage`)}
          className="size-9 px-0" loading={refreshing} loadingLabel={null} onClick={() => void refreshUsage()}>
          {!refreshing && <RefreshCw size={16} aria-hidden="true" />}
        </SettingsButton>
        <SettingsSegmentedControl ariaLabel={t(`${PREFIX}.period`)} value={period}
          onChange={value => setPeriod(value as WebDavUsagePeriod)}
          options={(Object.keys(WEB_DAV_USAGE_PERIOD_MINUTES) as WebDavUsagePeriod[])
            .map(value => ({ value, label: t(`${PREFIX}.${value}`) }))} />
      </SettingsControlSlot>
    </SettingsRow>
  </SettingsSection>;
}

function WebDavDeviceRow({ group, relay }: { group: SyncGroupPayload; relay: Relay }) {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const devices = group.devices.filter(device => device.state === 'active'
    && device.device_identity_key !== group.local_device_identity_key && device.platform.toLowerCase().startsWith('android'));
  const ready = relay.configured || relay.credential_draft_available;
  const status = !relay.delivered ? 'waiting' : relay.lan_baseline_required ? 'lanBaselineRequired'
    : relay.published_via_relay ? 'relayUploaded' : 'enabled';
  const available = new Set(relay.available_device_ids);
  const bound = group.devices.find(device => device.device_identity_key === relay.device_id);
  const nameOf = (device: SyncGroupDevicePayload) => group.device_display_names?.[device.device_identity_key]
    ?? syncGroupDeviceDisplayName(device, group.devices);

  async function bind(device: SyncGroupDevicePayload) {
    setBusy(true);
    setFailed(false);
    try {
      if (relay.credential_active || await requestAppConfirmation({
        title: t(`${PREFIX}.bindTitle`, { name: nameOf(device) }),
        description: t(`${PREFIX}.bindDescription`),
        confirmLabel: t(`${PREFIX}.bindConfirm`)
      })) await enableDesktopWebDavRelay(group.group_id, device.device_identity_key,
        relay.credential_draft_available ? true : undefined);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <SettingsRow title={t(`${PREFIX}.connectDevice`)}
    description={failed ? <span role="alert">{t(`${PREFIX}.credentialDeliveryFailed`)}</span>
      : relay.device_id ? undefined : t(`${PREFIX}.${ready ? 'deviceHint' : 'deviceSetupRequired'}`)}>
    <SettingsControlSlot>
      {relay.device_id ? <><span role="status" className="text-ui-sm text-muted-foreground">
        {bound ? `${nameOf(bound)} · ` : ''}{t(`${PREFIX}.${status}`)}
      </span>{bound && relay.credential_draft_available && !relay.credential_delivery
        ? <SettingsButton disabled={busy || (!relay.credential_offline_rotation_available && !available.has(bound.device_identity_key))} onClick={() => void bind(bound)}>
          {t(`${PREFIX}.${relay.credential_active ? 'credentialReplacePhone' : 'credentialVerifyDevice'}`)}
        </SettingsButton> : null}</> : <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <button type="button" disabled={busy || !ready || !devices.length}
            className={settingsFieldClassName('inline-flex items-center gap-2')}>
            {t(`${PREFIX}.chooseDevice`)} <ChevronDown size={15} aria-hidden />
          </button>
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="end">
          {devices.map(device => <AppDropdownMenuItem key={device.device_identity_key}
            disabled={!available.has(device.device_identity_key)} onSelect={() => void bind(device)}>
            {nameOf(device)}
          </AppDropdownMenuItem>)}
        </AppDropdownMenuContent>
      </AppDropdownMenu>}
    </SettingsControlSlot>
  </SettingsRow>;
}

function WebDavSetupStep({ children }: { children: ReactNode }) {
  return <li className="relative pl-7 before:absolute before:left-1 before:top-7 before:z-10 before:size-1.5 before:rounded-full before:bg-muted-foreground after:absolute after:left-[6px] after:top-7 after:-bottom-7 after:border-l after:border-dotted after:border-muted-foreground/65 last:after:hidden">
    {children}
  </li>;
}

export function SettingsWebDavSyncSection() {
  const t = useTranslation();
  const { overview, isLoading, refresh } = useDesktopSyncGroup();
  const { sync_group: group, webdav_relay: relay } = overview;
  if (isLoading) return null;
  if (!group || !relay) return <SettingsSection>
    <SettingsRow title={t(group ? `${PREFIX}.hostUnavailable` : `${PREFIX}.groupRequired`)} />
  </SettingsSection>;
  return <>
    <WebDavUsage relay={relay} refresh={refresh} />
    <SettingsSection title={t(`${PREFIX}.configuration`)} key={group.group_id}>
      <SettingsWebDavAttachmentRow groupId={group.group_id} policy={relay.attachment_policy} />
      <ol role="list" className="mx-settings-panel-x border-t border-settings-divider/70">
        <WebDavSetupStep>
          <SettingsWebDavRelayRow groupId={group.group_id} bound={Boolean(relay.device_id)} configured={relay.configured}
            credentialActive={Boolean(relay.credential_active)} />
        </WebDavSetupStep>
        <WebDavSetupStep>
          <WebDavDeviceRow group={group} relay={relay} />
          {relay.credential_delivery ? <SettingsWebDavCredentialDelivery key={relay.credential_delivery.id}
            groupId={group.group_id} delivery={relay.credential_delivery}
            phoneConnected={Boolean(relay.available_device_ids?.includes(relay.credential_delivery.device_id))} /> : null}
        </WebDavSetupStep>
      </ol>
    </SettingsSection>
  </>;
}
