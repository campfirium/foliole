import type { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow
} from '../../../../shared/ui';

import type { useReadwiseTokenConnection } from './useReadwiseTokenConnection';

type CompanionSyncOverview = ReturnType<typeof useDesktopCompanionPairingRequests>['overview'];
const SET_DESKTOP_PRIMARY_ACTION_ID = 'set-desktop-primary-device';

function formatPrimaryDeviceRole(role: CompanionSyncOverview['primary_device_state']['local_role']) {
  if (role === 'primary') return 'Primary device';
  if (role === 'secondary') return 'Secondary device';
  return 'Role unavailable';
}

function formatPrimaryDeviceDetail(state: CompanionSyncOverview['primary_device_state']) {
  if (state.local_role === 'primary' && state.source === 'self-unpaired') {
    return 'This desktop runs local sync and external sources until another device is paired.';
  }
  if (state.local_role === 'primary') {
    return 'This desktop runs sync and external sources for paired devices.';
  }
  if (state.local_role === 'secondary') {
    return 'This device follows the current primary device.';
  }
  return 'Primary device status is not available from the current sync state.';
}

function formatShortDeviceId(deviceId: string | null) {
  if (!deviceId) return 'Unavailable';
  return deviceId.length > 18 ? `${deviceId.slice(0, 10)}...${deviceId.slice(-6)}` : deviceId;
}

function formatReadwiseCredentialStatus(connection: ReturnType<typeof useReadwiseTokenConnection>['connection']) {
  if (connection.connected) return 'Ready';
  if (connection.status === 'storage_unavailable') return 'Storage unavailable';
  return 'Not connected';
}

function ValueText(props: { children: string }) {
  return <span className="text-sm font-medium text-foreground">{props.children}</span>;
}

export function SettingsCompanionSyncPrimaryRows(props: {
  isBusy: boolean;
  onSetDesktopAsPrimary(): void;
  overview: CompanionSyncOverview;
  pendingActionId: string | null;
  readwise: ReturnType<typeof useReadwiseTokenConnection>;
}) {
  const isSecondary = props.overview.primary_device_state.local_role === 'secondary';
  const isSettingPrimary = props.pendingActionId === SET_DESKTOP_PRIMARY_ACTION_ID;
  return (
    <>
      <SettingsRow description={formatPrimaryDeviceDetail(props.overview.primary_device_state)} title="Device role">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <div className="flex items-center gap-3">
            <ValueText>{formatPrimaryDeviceRole(props.overview.primary_device_state.local_role)}</ValueText>
            {isSecondary ? (
              <button
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-45"
                disabled={props.isBusy}
                onClick={props.onSetDesktopAsPrimary}
                type="button"
              >
                {isSettingPrimary ? 'Setting...' : 'Set as primary device'}
              </button>
            ) : null}
          </div>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description="Device id used for sync authority and external source ownership." title="Current primary">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <ValueText>{formatShortDeviceId(props.overview.primary_device_state.primary_device_id)}</ValueText>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description="Readwise credentials are kept in secure storage and follow the primary device." title="Readwise credentials">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <ValueText>{props.readwise.error ?? formatReadwiseCredentialStatus(props.readwise.connection)}</ValueText>
        </SettingsControlSlot>
      </SettingsRow>
    </>
  );
}
