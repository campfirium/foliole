import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, settingsButtonClassName, settingsValueBoxClassName } from '../../../../shared/ui';

export function ReadwiseReaderSettingsRow(props: {
  configured: boolean;
  onOpen?: () => void;
}) {
  const t = useTranslation();
  return (
    <SettingsRow
      description={t('settings.readwise.row.description')}
      title={t('settings.readwise.row.title')}
    >
      <SettingsControlSlot className={`${SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME} flex-col items-end gap-2`}>
        <div className={settingsValueBoxClassName()}>{props.configured ? t('settings.readwise.row.configured') : t('settings.readwise.row.needsSetup')}</div>
        <button className={settingsButtonClassName()} onClick={props.onOpen} type="button">
          {t('settings.readwise.row.open')}
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
