import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from '../../../../shared/ui';

export function UnavailableState() {
  const t = useTranslation();

  return (
    <div className={settingsActionTableRowClassName(SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME)}>
      <p className="col-span-full text-sm text-foreground/60">{t('settings.externalSources.desktopRequired')}</p>
    </div>
  );
}

export function ExternalLibraryHeader() {
  const t = useTranslation();
  const headers = [
    t('settings.externalSources.header.folder'),
    t('settings.externalSources.header.attachmentFolder'),
    t('settings.externalSources.header.excludedFolders'),
    t('settings.externalSources.header.status')
  ];

  return (
    <div className={settingsActionTableHeaderClassName(SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME)}>
      {headers.map((label) => (
        <span key={label}>{label}</span>
      ))}
      <span className="text-right">{t('settings.externalSources.header.actions')}</span>
    </div>
  );
}
