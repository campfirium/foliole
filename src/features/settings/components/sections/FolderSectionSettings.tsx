import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, SettingsSection, settingsFieldClassName } from '../../../../shared/ui';
import { MAX_FOLDER_SECTION_GAP, setFolderSectionGap, useFolderSectionSettings } from '../../../nodes/components/folderSectionSettings';

export function FolderSectionSettings() {
  const t = useTranslation();
  const { gap } = useFolderSectionSettings();
  const title = t('settings.appearance.folderSections.title');
  const gapLabel = t('settings.appearance.folderSections.gap');
  const fieldClassName = settingsFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME);

  return (
    <SettingsSection ariaLabel={title} title={title}>
      <SettingsRow data-settings-search-row-id="appearance-folder-section-gap" title={gapLabel} description={t('settings.appearance.folderSections.gapDescription')}>
        <SettingsControlSlot>
          <label className="inline-flex items-center gap-2">
            <input aria-label={gapLabel} className={fieldClassName} type="number" min={0} max={MAX_FOLDER_SECTION_GAP}
              value={gap} onChange={event => setFolderSectionGap(Number(event.target.value))} />
            <span className="text-sm text-foreground/65">px</span>
          </label>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
