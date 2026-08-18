import type { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  previewExternalSourceSettingsReconnect,
  reconnectExternalSourceSettingsFolder,
  selectExternalSourceSettingsFolderPath,
  type ExternalSourceSettingsFolder
} from '../../../shared/platform/externalSourceSettingsRepository';
import { requestAppConfirmation } from '../../../shared/ui';

export async function reconnectExternalSearchFolder(
  folderId: string,
  setFolders: (value: ExternalSourceSettingsFolder[]) => void,
  t: ReturnType<typeof useTranslation>
) {
  const folderPath = await selectExternalSourceSettingsFolderPath();
  if (!folderPath) return;
  const preview = await previewExternalSourceSettingsReconnect(folderId, folderPath);
  if (!preview) return;
  const confirmed = await requestAppConfirmation({
    cancelLabel: t('settings.externalSources.reconnect.cancel'),
    confirmLabel: t('settings.externalSources.reconnect.confirm'),
    description: t('settings.externalSources.reconnect.summary', {
      added: preview.new_count,
      matched: preview.matched_count,
      missing: preview.missing_count
    }),
    title: t('settings.externalSources.reconnect.title')
  });
  if (!confirmed) return;
  const folders = await reconnectExternalSourceSettingsFolder(folderId, folderPath);
  if (folders) setFolders(folders);
}
