import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';
import { AppStatusBadge } from '../../../../shared/ui';

type Translate = ReturnType<typeof useTranslation>;

function statusTone(folder: ExternalSourceSettingsFolder) {
  if (folder.status === 'ready') return 'success';
  if (folder.status === 'indexing') return 'info';
  if (folder.status === 'error') return 'error';
  return 'neutral';
}

function statusMeta(folder: ExternalSourceSettingsFolder, t: Translate) {
  if (folder.status === 'error') return folder.lastError ?? t('settings.externalSources.status.errorFallback');
  if (folder.status === 'ready') return t('settings.externalSources.status.readyMeta', { count: folder.documentCount });
  if (folder.status === 'indexing') return t('settings.externalSources.status.indexingMeta');
  return t('settings.externalSources.status.idleMeta');
}

function statusLabel(folder: ExternalSourceSettingsFolder, t: Translate) {
  if (folder.status === 'error' || Boolean(folder.lastError)) return t('settings.externalSources.status.unavailable');
  if (folder.status === 'indexing') return t('settings.externalSources.status.updating');
  if (folder.status === 'ready') return t('settings.externalSources.status.ready');
  return t('settings.externalSources.status.waiting');
}

export function ExternalLibraryStatus(props: { folder: ExternalSourceSettingsFolder }) {
  const t = useTranslation();
  const meta = statusMeta(props.folder, t);

  return (
    <div className="min-w-0" title={meta}>
      <AppStatusBadge label={statusLabel(props.folder, t)} tone={statusTone(props.folder)} />
    </div>
  );
}
