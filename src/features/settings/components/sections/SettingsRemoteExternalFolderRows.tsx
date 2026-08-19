import { MoreHorizontal } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from '../../../../shared/ui';

import { groupRemoteExternalFolders } from './remoteExternalFolderGroups';

const REMOTE_SOURCE_COLUMNS = '[grid-template-columns:16.25rem_minmax(0,1fr)]';

function FolderActions(props: {
  folder: ExternalSourceSettingsFolder;
  onReconnectFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
}) {
  const t = useTranslation();
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={t('settings.externalSources.remote.folderActions', { path: props.folder.folderPath })}
          className="grid h-8 w-8 place-items-center rounded-md text-foreground/55 transition-colors hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
          type="button"
        >
          <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={4}>
        <AppDropdownMenuItem
          disabled={props.folder.accessMode !== 'unowned'}
          onSelect={() => props.onReconnectFolder(props.folder.id)}
        >
          {t('settings.externalSources.remote.changeSource')}
        </AppDropdownMenuItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem
          className="text-destructive focus:text-destructive data-[highlighted]:text-destructive"
          onSelect={() => props.onRemoveFolder(props.folder.id)}
        >
          {t('settings.externalSources.remote.removeSource')}
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function DeviceActions(props: { deviceName: string }) {
  const t = useTranslation();
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={t('settings.externalSources.remote.deviceActions', { device: props.deviceName })}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-foreground/55 transition-colors hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
          type="button"
        >
          <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={4}>
        <AppDropdownMenuItem disabled>
          {t('settings.externalSources.remote.changeSource')}
        </AppDropdownMenuItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem disabled>
          {t('settings.externalSources.remote.removeSource')}
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function RemoteFolderRow(props: {
  folder: ExternalSourceSettingsFolder;
  onReconnectFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
}) {
  return (
    <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 rounded-md transition-colors hover:bg-settings-control-hover">
      <span className="min-w-0 truncate font-mono text-xs text-foreground/68">{props.folder.folderPath}</span>
      <FolderActions {...props} />
    </div>
  );
}

export function SettingsRemoteExternalFolderRows(props: {
  folders: ExternalSourceSettingsFolder[];
  onReconnectFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
}) {
  const t = useTranslation();
  const groups = groupRemoteExternalFolders(
    props.folders,
    t('settings.externalSources.remote.unknownDevice'),
    t('settings.externalSources.remote.unowned')
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
            aria-label={group.deviceName}
            className={settingsActionTableRowClassName(REMOTE_SOURCE_COLUMNS, 'items-start')}
            key={group.key}
            role="group"
          >
            <div className="flex min-h-10 min-w-0 items-center rounded-md transition-colors hover:bg-settings-control-hover">
              <div className="flex min-w-0 items-center gap-1">
                <span className="truncate text-sm font-semibold">{group.deviceName}</span>
                {group.platformName ? (
                  <span className="shrink-0 text-xs font-normal text-foreground/48">{group.platformName}</span>
                ) : null}
                <DeviceActions deviceName={group.deviceName} />
              </div>
            </div>
            <div className="grid min-w-0 gap-0.5">
              {group.folders.map((folder) => (
                <RemoteFolderRow
                  folder={folder}
                  key={folder.id}
                  onReconnectFolder={props.onReconnectFolder}
                  onRemoveFolder={props.onRemoveFolder}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
