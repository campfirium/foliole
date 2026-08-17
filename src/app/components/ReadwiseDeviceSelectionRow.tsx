import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow } from '../../shared/ui';

export function ReadwiseDeviceSelectionRow(props: {
  activeDeviceName: string | null;
  activeInstallationId: string | null;
  currentDeviceName: string | null;
  currentInstallationId: string | null;
  onTurnOff?: (() => void) | undefined;
  onUseThisDevice?: (() => void) | undefined;
}) {
  const t = useTranslation();
  const activeHere = Boolean(props.currentInstallationId) &&
    props.activeInstallationId === props.currentInstallationId;
  const status = activeHere
    ? t('desktop.readwise.device.activeHere')
    : props.activeInstallationId
      ? t('desktop.readwise.device.activeElsewhere', {
          device: props.activeDeviceName || t('desktop.readwise.device.unavailable')
        })
      : t('desktop.readwise.device.off');
  return (
    <SettingsRow description={status} title={t('desktop.readwise.device.title')}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex items-center justify-end gap-2">
          {props.activeInstallationId ? (
            <AppButton disabled={!props.onTurnOff} onClick={props.onTurnOff} size="sm" variant="default">
              {t('desktop.readwise.device.turnOff')}
            </AppButton>
          ) : null}
          {!activeHere ? (
            <AppButton disabled={!props.onUseThisDevice} onClick={props.onUseThisDevice} size="sm" variant="default">
              {t('desktop.readwise.device.useThisDevice')}
            </AppButton>
          ) : null}
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
