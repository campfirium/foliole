import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { useDesktopSyncGroup } from '../../../../shared/platform/useDesktopSyncGroup';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsErrorState,
  SettingsRow,
  SettingsSection,
  requestAppConfirmation
} from '../../../../shared/ui';

import { SettingsSyncGroupRows } from './SettingsSyncGroupRows';

function SyncAvailabilityRow(props: { disabled: boolean; enabled: boolean; onToggle(): void }) {
  const t = useTranslation();
  return (
    <SettingsRow
      description={t('settings.companionSync.group.sync.description')}
      title={t('settings.companionSync.group.sync.title')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsButton disabled={props.disabled} onClick={props.onToggle}>
          {t(props.enabled
            ? 'settings.companionSync.group.sync.turnOff'
            : 'settings.companionSync.group.sync.turnOn')}
        </SettingsButton>
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
  return { confirmLeave };
}

export function SettingsCompanionSyncSection() {
  const t = useTranslation();
  const state = useDesktopSyncGroup();
  const syncError = state.overview.server_status.last_error
    ? t('settings.companionSync.error.open', { error: state.overview.server_status.last_error })
    : undefined;
  const group = state.overview.sync_group;
  const groupName = group ? t('settings.companionSync.group.named', { name: group.display_name }) : '';
  const { confirmLeave } = useSyncGroupConfirmationActions(state, groupName);
  return (
    <SettingsSection ariaLabel={t('settings.companionSync.sectionAria')}>
      {syncError ? (
        <SettingsErrorState description={syncError} title={t('settings.companionSync.error.desktopUnavailable')} />
      ) : null}
      <SyncAvailabilityRow
        disabled={!state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        enabled={state.overview.sync_enabled}
        onToggle={() => void (state.overview.sync_enabled ? state.disableSync() : state.enableSync())}
      />
      <SyncNowRow
        disabled={!group || !state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        onSync={() => void state.syncNow()}
      />
      <SettingsSyncGroupRows
        candidates={state.overview.join_candidates ?? []}
        discovery={state.discovery}
        currentDevice={state.overview.current_device ?? null}
        group={state.overview.sync_group ?? null}
        isBusy={!state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        isCreating={state.pendingActionId === 'create-sync-group'}
        onLeave={() => void confirmLeave()}
        onTogglePause={() => void (state.overview.sync_paused ? state.resumeSync() : state.pauseSync())}
        onCreate={() => void state.createSyncGroup()}
        onDiscover={() => void state.discoverSyncGroups()}
        onRequestJoin={(endpointUrl) => void state.requestSyncGroupJoin(endpointUrl)}
        onAccept={(id) => void state.acceptRequest(id)}
        onReject={(id) => void state.rejectRequest(id)}
        joinRequests={state.overview.join_requests}
        joinRequest={state.overview.join_request ?? null}
        syncPaused={state.overview.sync_paused}
      />
      {state.error ? (
        <SettingsErrorState description={state.error} title={t('settings.companionSync.error.devicesUnavailable')} />
      ) : null}
    </SettingsSection>
  );
}
