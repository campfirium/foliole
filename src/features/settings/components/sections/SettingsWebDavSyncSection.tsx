import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type { DesktopSyncGroupOverviewPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupDevicePayload, SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { syncGroupDeviceDisplayName } from '../../../../../lib/platform/syncGroupRemovalModel';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { enableDesktopWebDavRelay } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { useDesktopSyncGroup } from '../../../../shared/platform/useDesktopSyncGroup';
import {
  AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger,
  SettingsButton, SettingsControlSlot, SettingsRow, SettingsSection, SettingsSegmentedControl,
  requestAppConfirmation, settingsFieldClassName
} from '../../../../shared/ui';

import { SettingsWebDavRelayRow } from './SettingsWebDavRelayRow';

const PREFIX = 'settings.companionSync.webdav' as const;
type Relay = NonNullable<DesktopSyncGroupOverviewPayload['webdav_relay']>;

function WebDavUsage({ relay }: { relay: Relay }) {
  const t = useTranslation();
  return <SettingsSection title={t(`${PREFIX}.usage`)} description={t(`${PREFIX}.usageDescription`)}
    actions={<SettingsButton disabled>{t(`${PREFIX}.openLog`)}</SettingsButton>}>
    <SettingsRow title={t(`${PREFIX}.usagePending`)}
      description={t(relay.configured ? `${PREFIX}.configured` : `${PREFIX}.unconfigured`)}>
      <SettingsControlSlot>
        <SettingsSegmentedControl ariaLabel={t(`${PREFIX}.period`)} disabled value="" onChange={() => {}}
          options={(['hour', 'halfHour', 'tenMinutes'] as const).map(value => ({ value, label: t(`${PREFIX}.${value}`) }))} />
      </SettingsControlSlot>
    </SettingsRow>
  </SettingsSection>;
}

function WebDavAttachmentRow() {
  const t = useTranslation();
  return <SettingsRow title={t(`${PREFIX}.attachments`)} description={t(`${PREFIX}.attachmentsPending`)}>
    <SettingsControlSlot>
      <SettingsSegmentedControl ariaLabel={t(`${PREFIX}.attachments`)} disabled value="" onChange={() => {}}
        options={(['attachmentsOff', 'attachmentsUnlimited', 'attachmentsLimited'] as const)
          .map(value => ({ value, label: t(`${PREFIX}.${value}`) }))} />
    </SettingsControlSlot>
  </SettingsRow>;
}

function WebDavDeviceRow({ group, relay }: { group: SyncGroupPayload; relay: Relay }) {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const devices = group.devices.filter(device => device.state === 'active'
    && device.device_identity_key !== group.local_device_identity_key && device.platform.toLowerCase().startsWith('android'));
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
      if (await requestAppConfirmation({
        title: t(`${PREFIX}.bindTitle`, { name: nameOf(device) }),
        description: t(`${PREFIX}.bindDescription`),
        confirmLabel: t(`${PREFIX}.bindConfirm`)
      })) await enableDesktopWebDavRelay(group.group_id, device.device_identity_key);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <SettingsRow title={t(`${PREFIX}.connectDevice`)}
    description={relay.device_id ? undefined : <span role={failed ? 'alert' : undefined}>{t(`${PREFIX}.deviceHint`)}</span>}>
    <SettingsControlSlot>
      {relay.device_id ? <span role="status" className="text-ui-sm text-muted-foreground">
        {bound ? `${nameOf(bound)} · ` : ''}{t(`${PREFIX}.${status}`)}
      </span> : <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <button type="button" disabled={busy || !devices.length}
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

export function SettingsWebDavSyncSection() {
  const t = useTranslation();
  const { overview, isLoading } = useDesktopSyncGroup();
  const { sync_group: group, webdav_relay: relay } = overview;
  if (isLoading) return null;
  if (!group || !relay) return <SettingsSection>
    <SettingsRow title={t(group ? `${PREFIX}.hostUnavailable` : `${PREFIX}.groupRequired`)} />
  </SettingsSection>;
  return <>
    <WebDavUsage relay={relay} />
    <SettingsSection title={t(`${PREFIX}.configuration`)} key={group.group_id}>
      <WebDavAttachmentRow />
      <SettingsWebDavRelayRow groupId={group.group_id} bound={Boolean(relay.device_id)} configured={relay.configured} />
      {relay.configured ? <WebDavDeviceRow group={group} relay={relay} /> : null}
    </SettingsSection>
  </>;
}
