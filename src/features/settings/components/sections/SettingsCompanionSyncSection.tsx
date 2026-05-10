import { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';

import { SettingsCompanionSyncDevicesRow } from './SettingsCompanionSyncDevicesRow';

function renderSyncError(overview: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']) {
  if (overview.server_status.last_error) {
    return `Could not open sync. ${overview.server_status.last_error}`;
  }
  return undefined;
}

function DeviceSyncSwitch(props: {
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
}) {
  const overview = props.state.overview;
  const disabled = !props.state.isDesktopRuntime || props.state.pendingActionId !== null || props.state.isLoading;

  return (
    <button
      aria-checked={overview.sync_enabled}
      aria-label="Enable desktop sync"
      className={settingsSwitchClassName(overview.sync_enabled)}
      disabled={disabled}
      onClick={() => void (overview.sync_enabled ? props.state.disableSync() : props.state.enableSync())}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={settingsSwitchKnobClassName(overview.sync_enabled)}
      />
    </button>
  );
}

export function SettingsCompanionSyncSection() {
  const state = useDesktopCompanionPairingRequests(3_000);
  const overview = state.overview;
  const syncError = renderSyncError(overview);

  return (
    <SettingsSection
      ariaLabel="Sync section"
      description="Turn on desktop sync before pairing another device. Phones on the same Wi-Fi can then sync with this desktop after you approve them."
      title="Sync"
    >
      <SettingsRow
        description={syncError ?? undefined}
        title="Enable on this desktop"
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <DeviceSyncSwitch state={state} />
        </SettingsControlSlot>
      </SettingsRow>
      {syncError ? (
        <p className="m-0 px-5 text-sm text-error" role="alert">
          {syncError}
        </p>
      ) : null}
      <SettingsCompanionSyncDevicesRow
        advertisedUrls={overview.server_status.advertised_urls}
        devices={overview.paired_devices}
        isBusy={!state.isDesktopRuntime || state.pendingActionId !== null}
        isLoading={state.isLoading}
        localRole={overview.primary_device_state.local_role}
        primaryDeviceId={overview.primary_device_state.primary_device_id}
        onDisconnect={(deviceId) => void state.removePairedDevice(deviceId)}
        onSetDesktopAsPrimary={() => void state.setDesktopAsPrimaryDevice()}
        pendingActionId={state.pendingActionId}
      />
      {state.error ? (
        <p className="m-0 text-sm text-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </SettingsSection>
  );
}
