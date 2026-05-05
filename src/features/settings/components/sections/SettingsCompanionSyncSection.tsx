import { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  settingsButtonClassName,
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


function formatDeviceKind(deviceKind: string) {
  if (deviceKind === 'android-capacitor' || deviceKind === 'android') {
    return 'Android';
  }
  return deviceKind || 'Client';
}

function resolveDeviceName(deviceName: string, deviceKind: string, clientAddress?: string | null) {
  const normalizedName = deviceName.trim();
  const isGeneratedAndroidName = normalizedName.toLowerCase().startsWith('android companion');
  if (!normalizedName || isGeneratedAndroidName) {
    if ((deviceKind === 'android-capacitor' || deviceKind === 'android') && clientAddress === '127.0.0.1') {
      return 'Android Emulator';
    }
    return deviceKind === 'android-capacitor' || deviceKind === 'android' ? 'Android device' : 'Device';
  }
  return normalizedName || formatDeviceKind(deviceKind);
}

function ConnectedDeviceList({
  devices,
  onDisconnect,
  pendingActionId
}: {
  devices: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['paired_devices'];
  onDisconnect(deviceId: string): void;
  pendingActionId: string | null;
}) {
  if (devices.length === 0) {
    return <p className="text-sm text-foreground/45">0 devices</p>;
  }
  return (
    <div className="mt-3 flex flex-col gap-2" role="list">
      {devices.map((device) => (
        <div
          className="flex items-center justify-between gap-4 py-2"
          key={device.device_id}
          role="listitem"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {resolveDeviceName(device.device_name, device.device_kind, device.client_address)} <span className="text-foreground/55">({formatDeviceKind(device.device_kind)})</span>
            </p>
            {device.client_address ? (
              <p className="mt-0.5 truncate text-xs text-foreground/50">{device.client_address}</p>
            ) : null}
          </div>
          <button
            className={settingsButtonClassName('h-8 px-2 text-xs')}
            disabled={pendingActionId === `remove-paired-device:${device.device_id}`}
            onClick={() => onDisconnect(device.device_id)}
            type="button"
          >
            {pendingActionId === `remove-paired-device:${device.device_id}` ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      ))}
    </div>
  );
}

function ConnectedDevicesRow({
  devices,
  isLoading,
  onDisconnect,
  pendingActionId
}: {
  devices: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['paired_devices'];
  isLoading: boolean;
  onDisconnect(deviceId: string): void;
  pendingActionId: string | null;
}) {
  return (
    <div
      className="relative px-5 py-5 before:absolute before:left-5 before:right-5 before:top-0 before:block before:border-t before:border-settings-divider/55"
      data-settings-row
    >
      <div>
        <h4 className="text-[0.95rem] font-normal text-foreground">Connected devices</h4>
        <p className="mt-0.5 text-sm text-foreground/65">Approved devices that can sync with this desktop.</p>
      </div>
      {isLoading ? (
        <p aria-busy="true" className="mt-4 text-sm text-foreground/45" role="status">
          Loading connected devices...
        </p>
      ) : (
        <ConnectedDeviceList devices={devices} onDisconnect={onDisconnect} pendingActionId={pendingActionId} />
      )}
    </div>
  );
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
      <ConnectedDevicesRow
        devices={overview.paired_devices}
        isLoading={state.isLoading}
        onDisconnect={(deviceId) => void state.removePairedDevice(deviceId)}
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
