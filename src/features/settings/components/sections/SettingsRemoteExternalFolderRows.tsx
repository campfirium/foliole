import { useId } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';
import { AppButton } from '../../../../shared/ui';

import {
  groupRemoteExternalFolders,
  remoteFolderName
} from './remoteExternalFolderGroups';

function RemoteFolderRow(props: {
  folder: ExternalSourceSettingsFolder;
  onReconnectFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
}) {
  const t = useTranslation();
  const name = remoteFolderName(props.folder.folderPath);
  return (
    <div className="grid min-h-10 grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_auto] items-center gap-4">
      <span className="min-w-0 truncate pl-6 text-sm font-medium">{name}</span>
      <span className="min-w-0 truncate text-sm text-foreground/60">{props.folder.folderPath}</span>
      {props.folder.accessMode === 'unowned' ? (
        <div className="flex gap-2">
          <AppButton onClick={() => props.onReconnectFolder(props.folder.id)} size="sm">
            {t('settings.externalSources.reconnect.action')}
          </AppButton>
          <AppButton onClick={() => props.onRemoveFolder(props.folder.id)} size="sm" variant="danger">
            {t('settings.externalSources.removeFolder')}
          </AppButton>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsRemoteExternalFolderRows(props: {
  folders: ExternalSourceSettingsFolder[];
  onReconnectFolder: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
}) {
  const t = useTranslation();
  const baseId = useId();
  const descriptionId = `${baseId}-description`;
  const groups = groupRemoteExternalFolders(props.folders, t('settings.externalSources.remote.unknownDevice'));
  return (
    <section aria-describedby={descriptionId} aria-label={t('settings.externalSources.remote.title')} className="mb-8 min-w-0 px-settings-panel-x">
      <div>
        <h3 className="text-base font-semibold">{t('settings.externalSources.remote.title')}</h3>
        <p className="mt-1 text-sm text-foreground/65" id={descriptionId}>{t('settings.externalSources.remote.description')}</p>
      </div>
      <div className="mt-3 grid gap-3">
        {groups.map((group, index) => {
          const labelId = `${baseId}-device-${index}`;
          return (
            <section aria-labelledby={labelId} className="min-w-0" key={group.key} role="group">
              <div className="flex min-h-10 min-w-0 items-center">
                <div className="flex min-w-0 items-baseline gap-2" id={labelId}>
                  <span className="truncate text-sm font-semibold">{group.deviceName}</span>
                  {group.platformName ? <span className="shrink-0 text-xs text-foreground/50">{group.platformName}</span> : null}
                </div>
              </div>
              {group.folders.map((folder) => (
                <RemoteFolderRow
                  folder={folder}
                  key={folder.id}
                  onReconnectFolder={props.onReconnectFolder}
                  onRemoveFolder={props.onRemoveFolder}
                />
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}
