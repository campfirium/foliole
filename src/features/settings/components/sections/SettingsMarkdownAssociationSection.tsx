import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { resolveRuntimeOperatingSystem } from '../../../../shared/platform/runtime/operatingSystem';
import { openExternalUrl } from '../../../../shared/platform/runtimeExternalNavigation';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { SETTINGS_MARKDOWN_ASSOCIATION_SEARCH_ROW_ID } from '../../model/settingsSearchRowCatalog';

const MACOS_DEFAULT_APP_GUIDE = 'https://support.apple.com/guide/mac-help/mh35597/mac';
const WINDOWS_DEFAULT_APP_GUIDE = 'https://support.microsoft.com/en-us/windows/apps/change-default-apps-in-windows';

export function SettingsMarkdownAssociationSection() {
  const t = useTranslation();
  const platform = resolveRuntimeOperatingSystem();
  if (platform === 'other') return null;

  const isMac = platform === 'macos';
  const guideUrl = isMac ? MACOS_DEFAULT_APP_GUIDE : WINDOWS_DEFAULT_APP_GUIDE;

  return (
    <SettingsSection
      ariaLabel={t('settings.markdownAssociation.title')}
      description={t('settings.markdownAssociation.description')}
      searchRowId={SETTINGS_MARKDOWN_ASSOCIATION_SEARCH_ROW_ID}
      title={t('settings.markdownAssociation.title')}
    >
      <SettingsRow
        description={t(isMac ? 'settings.markdownAssociation.macInstructions' : 'settings.markdownAssociation.windowsInstructions')}
        title={t('settings.markdownAssociation.defaultApp')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button className={settingsButtonClassName()} onClick={() => void openExternalUrl(guideUrl)} type="button">
            {t('settings.markdownAssociation.guide')}
          </button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
