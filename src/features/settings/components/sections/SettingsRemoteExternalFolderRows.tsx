import { useId } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';
import { settingsSwitchClassName, settingsSwitchKnobClassName } from '../../../../shared/ui';

import {
  groupRemoteExternalFolders,
  remoteFolderGroupState,
  remoteFolderName,
  type RemoteFolderGroupState
} from './remoteExternalFolderGroups';

function RemoteFolderToggle(props: {
  deviceName: string;
  disabled: boolean;
  folder: ExternalSourceSettingsFolder;
  onSetEnabled: (folderId: string, enabled: boolean) => void;
}) {
  const t = useTranslation();
  const enabled = props.folder.mirrorEnabled !== false;
  const name = remoteFolderName(props.folder.folderPath);
  return (
    <div className="grid min-h-10 grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_auto] items-center gap-4">
      <span className="min-w-0 truncate pl-6 text-sm font-medium">{name}</span>
      <span className="min-w-0 truncate text-sm text-foreground/60">{props.folder.folderPath}</span>
      <button
        aria-checked={enabled}
        aria-label={t('settings.externalSources.remote.enabledAria', { device: props.deviceName, folder: name })}
        className={settingsSwitchClassName(enabled)}
        disabled={props.disabled}
        onClick={() => props.onSetEnabled(props.folder.id, !enabled)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
      </button>
    </div>
  );
}

function GroupToggle(props: {
  deviceName: string;
  disabled: boolean;
  folderIds: string[];
  onSetEnabled: (folderIds: string[], enabled: boolean) => void;
  state: RemoteFolderGroupState;
}) {
  const t = useTranslation();
  const mixed = props.state === 'mixed';
  return (
    <button
      aria-checked={props.state}
      aria-label={t('settings.externalSources.remote.groupEnabledAria', { device: props.deviceName })}
      className={settingsSwitchClassName(props.state !== false)}
      disabled={props.disabled}
      onClick={() => props.onSetEnabled(props.folderIds, props.state !== true)}
      role="checkbox"
      type="button"
    >
      <span
        aria-hidden="true"
        className={settingsSwitchKnobClassName(props.state === true, mixed ? 'flex translate-x-3 items-center justify-center text-xs text-foreground/55' : undefined)}
      >
        {mixed ? '−' : null}
      </span>
    </button>
  );
}

export function SettingsRemoteExternalFolderRows(props: {
  folders: ExternalSourceSettingsFolder[];
  isSaving: boolean;
  onSetEnabled: (folderId: string | string[], enabled: boolean) => void;
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
          const state = remoteFolderGroupState(group.folders);
          return (
            <section aria-labelledby={labelId} className="min-w-0" key={group.key} role="group">
              <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                <div className="flex min-w-0 items-baseline gap-2" id={labelId}>
                  <span className="truncate text-sm font-semibold">{group.deviceName}</span>
                  {group.platformName ? <span className="shrink-0 text-xs text-foreground/50">{group.platformName}</span> : null}
                </div>
                <GroupToggle
                  deviceName={group.deviceName}
                  disabled={props.isSaving}
                  folderIds={group.folders.map((folder) => folder.id)}
                  onSetEnabled={props.onSetEnabled}
                  state={state}
                />
              </div>
              {group.folders.map((folder) => (
                <RemoteFolderToggle
                  deviceName={group.deviceName}
                  disabled={props.isSaving}
                  folder={folder}
                  key={folder.id}
                  onSetEnabled={props.onSetEnabled}
                />
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}
