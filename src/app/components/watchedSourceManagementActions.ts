import type { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  confirmSourceManagement,
  previewSourceManagement
} from '../../shared/platform/desktop/sourceManagementRepository';
import { selectRuntimeFolder } from '../../shared/platform/folderSelectionRuntimeRepository';
import {
  confirmWatchedFolderReconnectInRuntime,
  previewWatchedFolderReconnectInRuntime
} from '../../shared/platform/import/watchedFolderRuntimeRepository';
import { requestAppConfirmation } from '../../shared/ui';

type Translate = ReturnType<typeof useTranslation>;

export async function reconnectWatchedSource(bindingId: string, refresh: () => void, t: Translate) {
  const folderPath = await selectRuntimeFolder();
  if (!folderPath) return;
  const preview = await previewWatchedFolderReconnectInRuntime(bindingId, folderPath);
  const confirmed = await requestAppConfirmation({
    cancelLabel: t('desktop.watchedFolder.reconnect.cancel'),
    confirmLabel: t('desktop.watchedFolder.reconnect.confirm'),
    description: t('desktop.watchedFolder.reconnect.summary', {
      added: preview.new_count, matched: preview.matched_count, missing: preview.missing_count
    }),
    title: t('desktop.watchedFolder.reconnect.title')
  });
  if (!confirmed) return;
  await confirmWatchedFolderReconnectInRuntime(bindingId, folderPath);
  refresh();
}

export async function removeWatchedSource(sourceRef: string, refresh: () => void, t: Translate) {
  const input = { action: 'remove_source' as const, sourceRef };
  const preview = await previewSourceManagement(input);
  const confirmed = await requestAppConfirmation({
    cancelLabel: t('desktop.watchedFolder.remove.cancel'),
    confirmLabel: t('desktop.watchedFolder.remove.confirm'),
    description: t('desktop.watchedFolder.management.summary', {
      paths: preview.sources.map((source) => source.root_path).join(', '),
      sources: preview.source_count,
      topics: preview.topic_count
    }),
    title: t('desktop.watchedFolder.remove.title')
  });
  if (!confirmed) return;
  await confirmSourceManagement(input);
  refresh();
}

export async function replaceWatchedSourceHost(hostName: string, refresh: () => void, t: Translate) {
  const input = { action: 'replace_host' as const, hostName, sourceType: 'watched' as const };
  const preview = await previewSourceManagement(input);
  const confirmed = await requestAppConfirmation({
    cancelLabel: t('desktop.watchedFolder.remove.cancel'),
    confirmLabel: t('desktop.watchedFolder.management.replaceConfirm'),
    description: t('desktop.watchedFolder.management.summary', {
      paths: preview.sources.map((source) => source.root_path).join(', '),
      sources: preview.source_count,
      topics: preview.topic_count
    }),
    title: t('desktop.watchedFolder.management.replaceTitle', { host: hostName })
  });
  if (!confirmed) return;
  await confirmSourceManagement(input);
  refresh();
}
