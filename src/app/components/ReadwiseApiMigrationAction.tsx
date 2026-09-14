import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../shared/ui';

export function ReadwiseApiMigrationAction(props: {
  connected: boolean;
  onCancel: () => void;
  onMigrate: () => void;
}) {
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.api.activate.title')}>
      <SettingsRow
        description={(
          <>
            {t('desktop.readwise.api.activate.description')}
            {!props.connected ? <span className="mt-1 block text-error">{t('desktop.readwise.api.activate.connectionRequired')}</span> : null}
          </>
        )}
        title={t('desktop.readwise.api.activate.title')}
      >
        <SettingsControlSlot>
          <AppButton onClick={props.onCancel} size="sm" variant="ghost">
            {t('shared.confirm.cancel')}
          </AppButton>
          <AppButton
            className={SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME}
            disabled={!props.connected}
            onClick={props.onMigrate}
            size="sm"
            variant="emphasis"
          >
            {t('desktop.readwise.api.activate.action')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
