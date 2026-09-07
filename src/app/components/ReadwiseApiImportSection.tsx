import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

export function ReadwiseApiImportSection(props: {
  disabled: boolean;
  isRunning: boolean;
  onPreview: () => void;
}) {
  const t = useTranslation();
  return (
    <SettingsSection
      ariaLabel={t('desktop.readwise.api.import.title')}
      description={t('desktop.readwise.api.import.description')}
      title={t('desktop.readwise.api.import.title')}
    >
      <SettingsRow
        description={t('desktop.readwise.api.import.actionDescription')}
        title={t('desktop.readwise.api.import.actionTitle')}
      >
        <SettingsControlSlot>
          <AppButton disabled={props.disabled} onClick={props.onPreview} size="sm" variant="emphasis">
            {props.isRunning
              ? t('desktop.readwise.api.import.preparing')
              : t('desktop.readwise.api.import.preview')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
