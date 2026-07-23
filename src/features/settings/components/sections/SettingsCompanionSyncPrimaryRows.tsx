import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  AppSpinner,
  SettingsControlSlot,
  SettingsRow
} from '../../../../shared/ui';

type CompanionSyncOverview = ReturnType<typeof useDesktopCompanionPairingRequests>['overview'];
type Translate = ReturnType<typeof useTranslation>;
const SET_DESKTOP_PRIMARY_ACTION_ID = 'set-desktop-primary-device';

function formatPrimaryDeviceRole(role: CompanionSyncOverview['primary_device_state']['local_role'], t: Translate) {
  if (role === 'primary') return t('settings.companionSync.primary.role.primary');
  if (role === 'secondary') return t('settings.companionSync.primary.role.secondary');
  return t('settings.companionSync.primary.role.unavailable');
}

function formatPrimaryDeviceDetail(state: CompanionSyncOverview['primary_device_state'], t: Translate) {
  if (state.local_role === 'primary' && state.source === 'self-unpaired') {
    return t('settings.companionSync.primary.detail.selfUnpaired');
  }
  if (state.local_role === 'primary') {
    return t('settings.companionSync.primary.detail.primary');
  }
  if (state.local_role === 'secondary') {
    return t('settings.companionSync.primary.detail.secondary');
  }
  return t('settings.companionSync.primary.detail.unavailable');
}

function formatShortDeviceId(deviceId: string | null, t: Translate) {
  if (!deviceId) return t('settings.companionSync.primary.unavailable');
  return deviceId.length > 18 ? `${deviceId.slice(0, 10)}...${deviceId.slice(-6)}` : deviceId;
}

function ValueText(props: { children: string }) {
  return <span className="text-sm font-medium text-foreground">{props.children}</span>;
}

export function SettingsCompanionSyncPrimaryRows(props: {
  isBusy: boolean;
  onSetDesktopAsPrimary(): void;
  overview: CompanionSyncOverview;
  pendingActionId: string | null;
}) {
  const t = useTranslation();
  const isSecondary = props.overview.primary_device_state.local_role === 'secondary';
  const isSettingPrimary = props.pendingActionId === SET_DESKTOP_PRIMARY_ACTION_ID;
  return (
    <>
      <SettingsRow description={formatPrimaryDeviceDetail(props.overview.primary_device_state, t)} title={t('settings.companionSync.primary.role.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <div className="flex items-center gap-3">
            <ValueText>{formatPrimaryDeviceRole(props.overview.primary_device_state.local_role, t)}</ValueText>
            {isSecondary ? (
              <button
                aria-busy={isSettingPrimary || undefined}
                className={`relative inline-flex items-center justify-center text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed ${isSettingPrimary ? 'disabled:opacity-100' : 'disabled:opacity-45'}`}
                disabled={props.isBusy}
                onClick={props.onSetDesktopAsPrimary}
                type="button"
              >
                {isSettingPrimary ? <AppSpinner className="pointer-events-none absolute left-0" decorative size="sm" /> : null}
                <span className={isSettingPrimary ? 'translate-x-2' : undefined}>{t('settings.companionSync.primary.setAction')}</span>
              </button>
            ) : null}
          </div>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description={t('settings.companionSync.primary.current.description')} title={t('settings.companionSync.primary.current.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <ValueText>{formatShortDeviceId(props.overview.primary_device_state.primary_device_id, t)}</ValueText>
        </SettingsControlSlot>
      </SettingsRow>
    </>
  );
}
