import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsErrorState,
  SettingsRow,
  SettingsSection,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';

import { SettingsSyncGroupRows } from './SettingsSyncGroupRows';

function DeviceSyncSwitch(props: { state: ReturnType<typeof useDesktopCompanionPairingRequests> }) {
  const t = useTranslation();
  const overview = props.state.overview;
  const disabled = !props.state.isDesktopRuntime || props.state.pendingActionId !== null || props.state.isLoading;
  return (
    <button
      aria-checked={overview.sync_enabled}
      aria-label={t('settings.companionSync.enableDesktop.aria')}
      className={settingsSwitchClassName(overview.sync_enabled)}
      disabled={disabled}
      onClick={() => void (overview.sync_enabled ? props.state.disableSync() : props.state.enableSync())}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className={settingsSwitchKnobClassName(overview.sync_enabled)} />
    </button>
  );
}

export function SettingsCompanionSyncSection() {
  const t = useTranslation();
  const state = useDesktopCompanionPairingRequests(3_000);
  const syncError = state.overview.server_status.last_error
    ? t('settings.companionSync.error.open', { error: state.overview.server_status.last_error })
    : undefined;
  return (
    <SettingsSection
      ariaLabel={t('settings.companionSync.sectionAria')}
      description={t('settings.companionSync.description')}
      title={t('settings.companionSync.title')}
    >
      <SettingsRow description={syncError} title={t('settings.companionSync.enableDesktop.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <DeviceSyncSwitch state={state} />
        </SettingsControlSlot>
      </SettingsRow>
      {syncError ? (
        <SettingsErrorState description={syncError} title={t('settings.companionSync.error.desktopUnavailable')} />
      ) : null}
      <SettingsSyncGroupRows
        candidates={state.overview.join_candidates ?? []}
        group={state.overview.sync_group ?? null}
        isBusy={!state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        isCreating={state.pendingActionId === 'create-sync-group'}
        onCreate={() => void state.createSyncGroup()}
        onDiscover={() => void state.discoverSyncGroups()}
        onCompleteJoin={() => void state.completeSyncGroupJoin()}
        onRequestJoin={(endpointUrl) => void state.requestSyncGroupJoin(endpointUrl)}
        onApprove={(id) => void state.approveRequest(id)}
        onReject={(id) => void state.rejectRequest(id)}
        pendingRequests={state.overview.pending_requests}
        joinRequest={state.overview.join_request ?? null}
      />
      {state.error ? (
        <SettingsErrorState description={state.error} title={t('settings.companionSync.error.devicesUnavailable')} />
      ) : null}
    </SettingsSection>
  );
}
