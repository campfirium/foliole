import type { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import { settingsButtonClassName } from '../../../../shared/ui';

type CompanionSyncOverview = ReturnType<typeof useDesktopCompanionPairingRequests>['overview'];
type PrimaryDeviceRole = CompanionSyncOverview['primary_device_state']['local_role'];

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

function formatAddress(endpointUrl: string) {
  try {
    return new URL(endpointUrl).host || endpointUrl;
  } catch {
    return endpointUrl;
  }
}

function resolveDesktopDetail(advertisedUrls: string[]) {
  const address = advertisedUrls.map(formatAddress).find(Boolean);
  return address ? `Windows · ${address}` : 'Windows desktop';
}

function PrimaryBadge() {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground/70">
      Primary
    </span>
  );
}

function DesktopDeviceRow(props: {
  advertisedUrls: string[];
  isBusy: boolean;
  localRole: PrimaryDeviceRole;
  pendingActionId: string | null;
  onSetDesktopAsPrimary(): void;
}) {
  const isSettingPrimary = props.pendingActionId === 'set-desktop-primary-device';
  return (
    <div className="flex items-center justify-between gap-4 py-2" role="listitem">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">This desktop</p>
        <p className="mt-0.5 truncate text-xs text-foreground/50">{resolveDesktopDetail(props.advertisedUrls)}</p>
      </div>
      {props.localRole === 'primary' ? (
        <PrimaryBadge />
      ) : props.localRole === 'secondary' ? (
        <button
          className={settingsButtonClassName('h-8 px-3 text-xs')}
          disabled={props.isBusy}
          onClick={props.onSetDesktopAsPrimary}
          type="button"
        >
          {isSettingPrimary ? 'Setting...' : 'Set as primary'}
        </button>
      ) : (
        <span className="text-xs font-medium text-foreground/45">Unavailable</span>
      )}
    </div>
  );
}

function ConnectedDeviceList(props: {
  advertisedUrls: string[];
  devices: CompanionSyncOverview['paired_devices'];
  isBusy: boolean;
  localRole: PrimaryDeviceRole;
  onDisconnect(deviceId: string): void;
  onSetDesktopAsPrimary(): void;
  pendingActionId: string | null;
  primaryDeviceId: string | null;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2" role="list">
      <DesktopDeviceRow
        advertisedUrls={props.advertisedUrls}
        isBusy={props.isBusy}
        localRole={props.localRole}
        pendingActionId={props.pendingActionId}
        onSetDesktopAsPrimary={props.onSetDesktopAsPrimary}
      />
      {props.devices.map((device) => (
        <div className="flex items-center justify-between gap-4 py-2" key={device.device_id} role="listitem">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {resolveDeviceName(device.device_name, device.device_kind, device.client_address)}{' '}
              <span className="text-foreground/55">({formatDeviceKind(device.device_kind)})</span>
            </p>
            {device.client_address ? (
              <p className="mt-0.5 truncate text-xs text-foreground/50">{device.client_address}</p>
            ) : null}
          </div>
          {device.device_id === props.primaryDeviceId ? (
            <PrimaryBadge />
          ) : (
            <button
              className={settingsButtonClassName('h-8 px-2 text-xs')}
              disabled={props.pendingActionId === `remove-paired-device:${device.device_id}`}
              onClick={() => props.onDisconnect(device.device_id)}
              type="button"
            >
              {props.pendingActionId === `remove-paired-device:${device.device_id}` ? 'Disconnecting...' : 'Disconnect'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function SettingsCompanionSyncDevicesRow(props: {
  advertisedUrls: string[];
  devices: CompanionSyncOverview['paired_devices'];
  isBusy: boolean;
  isLoading: boolean;
  localRole: PrimaryDeviceRole;
  onDisconnect(deviceId: string): void;
  onSetDesktopAsPrimary(): void;
  pendingActionId: string | null;
  primaryDeviceId: string | null;
}) {
  return (
    <div
      className="relative px-5 py-5 before:absolute before:left-5 before:right-5 before:top-0 before:block before:border-t before:border-settings-divider/55"
      data-settings-row
    >
      <div>
        <h4 className="text-[0.95rem] font-normal text-foreground">Devices</h4>
        <p className="mt-0.5 text-sm text-foreground/65">This desktop and approved devices that can sync.</p>
      </div>
      {props.isLoading ? (
        <p aria-busy="true" className="mt-4 text-sm text-foreground/45" role="status">
          Loading connected devices...
        </p>
      ) : (
        <ConnectedDeviceList
          devices={props.devices}
          advertisedUrls={props.advertisedUrls}
          isBusy={props.isBusy}
          localRole={props.localRole}
          primaryDeviceId={props.primaryDeviceId}
          onDisconnect={props.onDisconnect}
          onSetDesktopAsPrimary={props.onSetDesktopAsPrimary}
          pendingActionId={props.pendingActionId}
        />
      )}
    </div>
  );
}
