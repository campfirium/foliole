import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';
import {
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from '../../../../shared/ui';

import { groupRemoteExternalFolders } from './remoteExternalFolderGroups';

const REMOTE_SOURCE_COLUMNS = '[grid-template-columns:16.25rem_minmax(0,1fr)]';

export function SettingsRemoteExternalFolderRows(props: {
  folders: ExternalSourceSettingsFolder[];
}) {
  const t = useTranslation();
  const groups = groupRemoteExternalFolders(
    props.folders,
    t('settings.externalSources.remote.unknownHost')
  );
  return (
    <section aria-label={t('settings.externalSources.remote.title')} className="mb-8 min-w-0">
      <div className={settingsActionTableHeaderClassName(REMOTE_SOURCE_COLUMNS)}>
        <span>{t('settings.externalSources.remote.title')}</span>
        <span>{t('settings.externalSources.remote.path')}</span>
      </div>
      <div className="grid gap-1">
        {groups.map((group) => (
          <section
            aria-label={group.hostName}
            className={settingsActionTableRowClassName(REMOTE_SOURCE_COLUMNS, 'items-start')}
            key={group.key}
            role="group"
          >
            <div className="flex min-h-10 min-w-0 items-center rounded-md transition-colors hover:bg-settings-control-hover">
              <div className="flex min-w-0 items-center gap-1">
                <span className="truncate text-sm font-semibold">{group.hostName}</span>
                {group.platformName ? (
                  <span className="shrink-0 text-xs font-normal text-foreground/48">{group.platformName}</span>
                ) : null}
              </div>
            </div>
            <div className="grid min-w-0 gap-0.5">
              {group.folders.map((folder) => (
                <div className="flex min-h-10 min-w-0 items-center" key={folder.id}>
                  <span className="min-w-0 truncate font-mono text-xs text-foreground/68">{folder.folderPath}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
