import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsErrorState,
  SettingsLoadingState,
  SettingsRow,
  SettingsSection,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';

import { SettingsCompanionSyncPrimaryRows } from './SettingsCompanionSyncPrimaryRows';

type Translate = ReturnType<typeof useTranslation>;

function renderSyncError(overview: ReturnType<typeof useDesktopCompanionPairingRequests>['overview'], t: Translate) {
  if (overview.server_status.last_error) {
    return t('settings.companionSync.error.open', { error: overview.server_status.last_error });
  }
  return undefined;
}

function formatDeviceKind(deviceKind: string, t: Translate) {
  if (deviceKind === 'android-capacitor' || deviceKind === 'android') {
    return 'Android';
  }
  if (deviceKind === 'ios-capacitor' || deviceKind === 'ios') {
    return 'iOS';
  }
  return deviceKind || t('settings.companionSync.device.client');
}

function resolveDeviceName(deviceName: string, deviceKind: string, t: Translate, clientAddress?: string | null) {
  const normalizedName = deviceName.trim();
  const isGeneratedAndroidName = normalizedName.toLowerCase().startsWith('android companion');
  if (!normalizedName || isGeneratedAndroidName) {
    if ((deviceKind === 'android-capacitor' || deviceKind === 'android') && clientAddress === '127.0.0.1') {
      return t('settings.companionSync.device.androidEmulator');
    }
    return deviceKind === 'android-capacitor' || deviceKind === 'android'
      ? t('settings.companionSync.device.androidDevice')
      : t('settings.companionSync.device.generic');
  }
  return normalizedName || formatDeviceKind(deviceKind, t);
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
  const t = useTranslation();

  if (devices.length === 0) {
    return <p className="text-sm text-foreground/45">{t('settings.companionSync.connected.empty')}</p>;
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
              {resolveDeviceName(device.device_name, device.device_kind, t, device.client_address)} <span className="text-foreground/55">({formatDeviceKind(device.device_kind, t)})</span>
            </p>
            {device.client_address ? (
              <p className="mt-0.5 truncate text-xs text-foreground/50">{device.client_address}</p>
            ) : null}
          </div>
          <SettingsButton
            className="h-8 px-2 text-xs"
            loading={pendingActionId === `remove-paired-device:${device.device_id}`}
            onClick={() => onDisconnect(device.device_id)}
          >
            {t('settings.companionSync.disconnect.action')}
          </SettingsButton>
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
  const t = useTranslation();

  return (
    <div
      className="relative px-5 py-5 before:absolute before:left-5 before:right-5 before:top-0 before:block before:border-t before:border-settings-divider/55"
      data-settings-row
    >
      <div>
        <h4 className="text-[0.95rem] font-normal text-foreground">{t('settings.companionSync.connected.title')}</h4>
        <p className="mt-0.5 text-sm text-foreground/65">{t('settings.companionSync.connected.description')}</p>
      </div>
      {isLoading ? (
        <SettingsLoadingState className="mt-3 px-0 py-0" />
      ) : (
        <ConnectedDeviceList devices={devices} onDisconnect={onDisconnect} pendingActionId={pendingActionId} />
      )}
    </div>
  );
}

function DeviceSyncSwitch(props: {
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
}) {
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
      <span
        aria-hidden="true"
        className={settingsSwitchKnobClassName(overview.sync_enabled)}
      />
    </button>
  );
}

export function SettingsCompanionSyncSection() {
  const t = useTranslation();
  const state = useDesktopCompanionPairingRequests(3_000);
  const overview = state.overview;
  const syncError = renderSyncError(overview, t);

  return (
    <SettingsSection
      ariaLabel={t('settings.companionSync.sectionAria')}
      description={t('settings.companionSync.description')}
      title={t('settings.companionSync.title')}
    >
      <SettingsRow
        description={syncError ?? undefined}
        title={t('settings.companionSync.enableDesktop.title')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <DeviceSyncSwitch state={state} />
        </SettingsControlSlot>
      </SettingsRow>
      {syncError ? (
        <SettingsErrorState
          className="px-5 py-3"
          description={syncError}
          title={t('settings.companionSync.error.desktopUnavailable')}
        />
      ) : null}
      <SettingsCompanionSyncPrimaryRows
        isBusy={!state.isDesktopRuntime || state.pendingActionId !== null || state.isLoading}
        overview={overview}
        pendingActionId={state.pendingActionId}
        onSetDesktopAsPrimary={() => void state.setDesktopAsPrimaryDevice()}
      />
      <ConnectedDevicesRow
        devices={overview.paired_devices}
        isLoading={state.isLoading}
        onDisconnect={(deviceId) => void state.removePairedDevice(deviceId)}
        pendingActionId={state.pendingActionId}
      />
      {state.error ? (
        <SettingsErrorState
          className="px-5 py-3"
          description={state.error}
          title={t('settings.companionSync.error.devicesUnavailable')}
        />
      ) : null}
    </SettingsSection>
  );
}
