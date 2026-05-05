import { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';

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
      aria-label="Sync"
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

  return (
    <SettingsSection
      ariaLabel="Sync section"
      description="Turn on desktop sync before pairing another device. Phones on the same Wi-Fi can then sync with this desktop after you approve them."
      title="Sync"
    >
      <SettingsRow
        description={renderSyncError(overview) ?? "Turn on sync for this desktop."}
        title="Sync"
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <DeviceSyncSwitch state={state} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow
        description="Approved devices that can sync with this desktop."
        title="Connected devices"
      >
        <SettingsControlSlot className={`${SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME} text-sm text-foreground/65`}>
          {state.isLoading ? 'Loading...' : overview.server_status.paired_device_count}
        </SettingsControlSlot>
      </SettingsRow>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
    </SettingsSection>
  );
}
