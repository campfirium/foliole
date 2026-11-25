import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { selectLocalFileToOpen } from '../../../../shared/platform/localFileRuntimeRepository';
import { resolveRuntimeOperatingSystem } from '../../../../shared/platform/runtime/operatingSystem';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { SETTINGS_LOCAL_FILE_SEARCH_ROW_ID } from '../../model/settingsSearchRowCatalog';

export function SettingsLocalFileSection({ onFileSelected }: { onFileSelected: () => void }) {
  const t = useTranslation();
  const [isOpening, setIsOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const permissionDescription = resolveRuntimeOperatingSystem() === 'macos'
    ? t('settings.localFile.macPermission')
    : t('settings.localFile.permission');

  async function openFile() {
    setIsOpening(true);
    setOpenFailed(false);
    try {
      const result = await selectLocalFileToOpen();
      if (result.status === 'selected') onFileSelected();
      if (result.status === 'error') setOpenFailed(true);
    } catch {
      setOpenFailed(true);
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <SettingsSection
      ariaLabel={t('settings.localFile.title')}
      description={t('settings.localFile.description')}
      searchRowId={SETTINGS_LOCAL_FILE_SEARCH_ROW_ID}
      title={t('settings.localFile.title')}
    >
      <SettingsRow
        description={<>
          {permissionDescription}
          {openFailed ? <span className="block" role="alert">{t('settings.localFile.openFailed')}</span> : null}
        </>}
        title={t('settings.localFile.permissionTitle')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button className={settingsButtonClassName()} disabled={isOpening} onClick={() => void openFile()} type="button">
            {t('settings.localFile.open')}
          </button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
