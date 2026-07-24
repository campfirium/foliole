import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';

export function SettingsRemoteExternalFolderRows(props: {
  folders: ExternalSourceSettingsFolder[];
  onSetEnabled: (folderId: string, enabled: boolean) => void;
}) {
  const t = useTranslation();
  return (
    <section className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3" aria-label={t('settings.externalSources.remote.title')}>
      <div className="mb-2 text-sm font-medium">{t('settings.externalSources.remote.title')}</div>
      <div className="space-y-2">
        {props.folders.map((folder) => (
          <label className="flex min-w-0 items-center gap-3 rounded-lg bg-background/70 px-3 py-2" key={folder.id}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {folder.folderPath.split(/[\\/]/).filter(Boolean).at(-1) ?? folder.folderPath}
                {folder.ownerDeviceName ? ` · ${folder.ownerDeviceName}` : ''}
              </span>
              <span className="block truncate text-xs text-foreground/55">{folder.folderPath}</span>
              <span className="block text-xs text-foreground/55">{t('settings.externalSources.remote.readOnly')}</span>
            </span>
            <input
              aria-label={t('settings.externalSources.remote.enabledAria', { device: folder.ownerDeviceName ?? '' })}
              checked={folder.mirrorEnabled !== false}
              onChange={(event) => props.onSetEnabled(folder.id, event.target.checked)}
              type="checkbox"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
