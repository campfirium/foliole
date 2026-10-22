import { useState } from 'react';

import type { SyncGroupDevicePayload } from '../../../../../lib/platform/syncGroupContract';
import { useTranslation, type Translate } from '../../../../shared/localization/LocalizationProvider';
import { useDesktopSyncGroup } from '../../../../shared/platform/useDesktopSyncGroup';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsErrorState,
  SettingsRow,
  SettingsSection,
  requestAppConfirmation,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { SyncProtocolIncompatibleDialog } from '../../../../shared/ui/SyncProtocolIncompatibleDialog';
import { isSyncProtocolIncompatibleError, useSyncProtocolIncompatibleNotice } from '../../../../shared/ui/useSyncProtocolIncompatibleNotice';

import { SettingsSyncDiagnosticsRow } from './SettingsSyncDiagnosticsRow';
import { SettingsSyncGroupRows } from './SettingsSyncGroupRows';

function SyncAvailabilityRow(props: { disabled: boolean; enabled: boolean; onToggle(): void }) {
  const t = useTranslation();
  const title = t('settings.companionSync.group.sync.title');
  return (
    <SettingsRow
      description={t('settings.companionSync.group.sync.description')}
      title={title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-checked={props.enabled}
          aria-label={title}
          className={settingsSwitchClassName(props.enabled)}
          disabled={props.disabled}
          onClick={props.onToggle}
          role="switch"
          type="button"
        >
          <span aria-hidden="true" className={settingsSwitchKnobClassName(props.enabled)} />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function SyncNowRow(props: { disabled: boolean; onSync(): void }) {
  const t = useTranslation();
  return (
    <SettingsRow
      description={t('settings.companionSync.group.syncNow.description')}
      title={t('settings.companionSync.group.syncNow.title')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsButton disabled={props.disabled} onClick={props.onSync}>
          {t('companion.sync.action.syncNow')}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function useSyncGroupConfirmationActions(
  state: ReturnType<typeof useDesktopSyncGroup>,
  groupName: string
) {
  const t = useTranslation();
  const confirmLeave = async () => {
    if (!state.overview.sync_group || !await requestAppConfirmation({
      confirmLabel: t('settings.companionSync.group.leave'),
      description: t('settings.companionSync.group.leave.confirm.description', { name: groupName }),
      title: t('settings.companionSync.group.leave.confirm.title')
    })) return;
    await state.leaveSyncGroup();
  };
  const confirmRemove = async (device: SyncGroupDevicePayload) => {
    if (!await requestAppConfirmation({
      confirmLabel: t('settings.companionSync.group.remove'),
      description: t('settings.companionSync.group.remove.confirm.description', { name: device.device_name }),
      title: t('settings.companionSync.group.remove.confirm.title')
    })) return;
    await state.removeSyncGroupDevice(device.device_identity_key);
  };
  return { confirmLeave, confirmRemove };
}

export function SettingsCompanionSyncSection() {
  const t = useTranslation();
  const state = useDesktopSyncGroup();
  const protocolNotice = useSyncProtocolIncompatibleNotice(
    state.discovery.error_code === 'protocol_incompatible' || isSyncProtocolIncompatibleError(state.error)
  );
  const syncError = localizeSyncError(state.overview.server_status.last_error, t);
  const group = state.overview.sync_group;
  const groupName = group ? t('settings.companionSync.group.named', { name: group.display_name }) : '';
  const { confirmLeave, confirmRemove } = useSyncGroupConfirmationActions(state, groupName);
  return (
    <SettingsSection ariaLabel={t('settings.companionSync.sectionAria')}>
      <SyncProtocolIncompatibleDialog open={protocolNotice.open} onClose={protocolNotice.close} />
      {syncError ? (
        <SettingsErrorState description={syncError} title={t('settings.companionSync.error.desktopUnavailable')} />
      ) : null}
      <SyncAvailabilityRow
        disabled={!state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        enabled={state.overview.sync_enabled}
        onToggle={() => void (state.overview.sync_enabled ? state.disableSync() : state.enableSync())}
      />
      <PendingBackupRestoreNotice pending={Boolean(state.overview.pending_backup_restore)} />
      <ExpiredMemberNotice busy={!state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        expired={Boolean(state.overview.expired_member)} onOverwrite={state.overwriteExpiredMember} />
      <SyncNowRow
        disabled={!group || !state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        onSync={() => { protocolNotice.retry(); void state.syncNow(); }}
      />
      <SettingsSyncDiagnosticsRow disabled={!state.isDesktopRuntime} />
      <SettingsSyncGroupRows
        candidates={state.overview.join_candidates ?? []}
        discovery={state.discovery}
        hostPlatform={state.overview.host_platform}
        currentDevice={state.overview.current_device ?? null}
        group={state.overview.sync_group ?? null}
        isBusy={!state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        isCreating={state.pendingActionId === 'create-sync-group'}
        onLeave={() => void confirmLeave()}
        onRemove={(device) => void confirmRemove(device)}
        onTogglePause={() => void (state.overview.sync_paused ? state.resumeSync() : state.pauseSync())}
        onCreate={() => void state.createSyncGroup()}
        onDiscover={() => { protocolNotice.retry(); void state.discoverSyncGroups(); }}
        onOpenSettings={() => void state.openNetworkSettings()}
        onRecoverDiscovery={() => void state.recoverDiscovery()}
        onRequestJoin={(endpointUrl) => void state.requestSyncGroupJoin(endpointUrl)}
        onAccept={(id) => void state.acceptRequest(id)}
        onReject={(id) => void state.rejectRequest(id)}
        joinRequests={state.overview.join_requests}
        joinRequest={state.overview.join_request ?? null}
        syncEnabled={state.overview.sync_enabled}
        discoveryError={state.overview.discovery_error}
        syncPaused={state.overview.sync_paused}
        removingDevices={state.overview.removing_devices}
      />
      {state.error ? (
        <SettingsErrorState description={state.error} title={t('settings.companionSync.error.devicesUnavailable')} />
      ) : null}
    </SettingsSection>
  );
}

function PendingBackupRestoreNotice({ pending }: { pending: boolean }) {
  const t = useTranslation();
  return pending ? <SettingsRow title={t('settings.backups.restore.sync.pendingTitle')}
    description={t('settings.backups.restore.sync.pendingDescription')} /> : null;
}

/** A device silent past the group's history window can only resume by taking the group's data. */
function ExpiredMemberNotice(props: { busy: boolean; expired: boolean; onOverwrite(): Promise<unknown> | void }) {
  const t = useTranslation();
  const [unreachable, setUnreachable] = useState(false);
  if (!props.expired) return null;
  const confirm = async () => {
    if (!await requestAppConfirmation({ confirmLabel: t('settings.companionSync.expired.action'),
      description: t('settings.companionSync.expired.confirmDescription'),
      title: t('settings.companionSync.expired.confirmTitle') })) return;
    setUnreachable(false);
    try { await props.onOverwrite(); }
    catch (error) { if (String(error).includes('sync_group_current_peer_unavailable')) setUnreachable(true); }
  };
  const description = unreachable
    ? <>{t('settings.companionSync.expired.description')}<br />{t('settings.companionSync.expired.unavailable')}</>
    : t('settings.companionSync.expired.description');
  return (
    <SettingsRow description={description} title={t('settings.companionSync.expired.title')}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsButton disabled={props.busy} onClick={() => void confirm()}>
          {t('settings.companionSync.expired.action')}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function localizeSyncError(error: string | null | undefined, t: Translate) {
  return error ? t('settings.companionSync.error.open', { error }) : undefined;
}
