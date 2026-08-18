import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type {
  ExternalSourceSettingsFolder,
  ExternalSourceSettingsFolderPatch
} from '../../../../shared/platform/externalSourceSettingsRepository';
import {
  ObjectConfigPathButton,
  SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME,
  settingsActionTableAddButtonClassName,
  settingsActionTableClassName,
  settingsActionTableRowClassName,
  settingsFieldClassName
} from '../../../../shared/ui';

import { ExternalLibraryRowActions } from './ExternalLibraryRowActions';
import { ExternalLibraryStatus } from './SettingsExternalSearchSectionStatus';
import { ExternalLibraryHeader, UnavailableState } from './SettingsExternalSearchSectionTableChrome';

type ExternalLibraryFolderUpdate = (folderId: string, patch: ExternalSourceSettingsFolderPatch) => void;

const EXTERNAL_LIBRARY_COLUMNS = SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME;

function excludedFoldersValue(folders: string[]) {
  return folders.join(', ');
}

function ExternalLibraryPathButton(props: {
  disabled: boolean;
  emptyLabel: string;
  label: string;
  onClick: () => void;
  path: string;
}) {
  return (
    <ObjectConfigPathButton
      className="h-9 w-full px-2.5 text-sm"
      disabled={props.disabled}
      emptyLabel={props.emptyLabel}
      label={props.label}
      onClick={props.onClick}
      path={props.path}
    />
  );
}

function ExternalLibraryExcludedInput(props: {
  disabled: boolean;
  folder: ExternalSourceSettingsFolder;
  onUpdateFolder: ExternalLibraryFolderUpdate;
}) {
  const t = useTranslation();

  return (
    <input
      aria-label={t('settings.externalSources.excludedForAria', { path: props.folder.folderPath })}
      className={settingsFieldClassName()}
      disabled={props.disabled}
      onChange={(event) =>
        props.onUpdateFolder(props.folder.id, {
          excludedDirs: event.target.value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        })
      }
      placeholder={t('settings.externalSources.excludedPlaceholder')}
      title={props.folder.excludedDirs.length > 0 ? props.folder.excludedDirs.join('\n') : undefined}
      value={excludedFoldersValue(props.folder.excludedDirs)}
    />
  );
}

function ExternalLibraryDraftRow(props: { disabled: boolean; onAddFolder: () => void }) {
  const t = useTranslation();

  return (
    <div className={settingsActionTableRowClassName(EXTERNAL_LIBRARY_COLUMNS)}>
      <ExternalLibraryPathButton
        disabled={props.disabled}
        emptyLabel={t('settings.externalSources.chooseFolder')}
        label={t('settings.externalSources.chooseFolder')}
        onClick={props.onAddFolder}
        path=""
      />
      <ExternalLibraryPathButton
        disabled
        emptyLabel={t('settings.externalSources.notUsed')}
        label={t('settings.externalSources.chooseAttachmentFolder')}
        onClick={props.onAddFolder}
        path=""
      />
      <input
        aria-label={t('settings.externalSources.excludedAria')}
        className={settingsFieldClassName()}
        disabled
        placeholder={t('settings.externalSources.excludedPlaceholder')}
        value=""
        readOnly
      />
      <div className="min-w-0 text-sm text-foreground/55">{t('settings.externalSources.newFolder')}</div>
      <div aria-hidden="true" />
    </div>
  );
}

function ExternalLibraryAddRow(props: { disabled: boolean; onAddFolder: () => void }) {
  const t = useTranslation();

  return (
    <div className={settingsActionTableRowClassName(EXTERNAL_LIBRARY_COLUMNS, 'pb-3 pt-1')}>
      <button
        aria-label={t('settings.externalSources.addFolder')}
        className={settingsActionTableAddButtonClassName()}
        disabled={props.disabled}
        onClick={props.onAddFolder}
        type="button"
      >
        <Plus aria-hidden="true" size={15} strokeWidth={1.9} />
        {t('settings.externalSources.addFolder')}
      </button>
    </div>
  );
}

export function ExternalLibraryTable(props: {
  children: ReactNode;
  folders: ExternalSourceSettingsFolder[];
  isDesktopRuntime: boolean;
  isSaving: boolean;
  onAddFolder: () => void;
}) {
  const t = useTranslation();
  const disabled = props.isSaving;

  return (
    <div className={settingsActionTableClassName()} role="table" aria-label={t('settings.externalSources.tableAria')}>
      <ExternalLibraryHeader />
      {props.isDesktopRuntime ? (
        <>
          {props.folders.length > 0 ? (
            props.children
          ) : (
            <ExternalLibraryDraftRow disabled={disabled} onAddFolder={props.onAddFolder} />
          )}
          <ExternalLibraryAddRow disabled={disabled} onAddFolder={props.onAddFolder} />
        </>
      ) : (
        <UnavailableState />
      )}
    </div>
  );
}

export function ExternalLibraryRow(props: {
  folder: ExternalSourceSettingsFolder;
  isSaving: boolean;
  onChooseAttachmentRoot: (folderId: string) => void;
  onChooseFolder: (folderId: string) => void;
  onDisconnectFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onUpdateFolder: ExternalLibraryFolderUpdate;
}) {
  const t = useTranslation();
  const disabled = props.isSaving;

  return (
    <div className={settingsActionTableRowClassName(EXTERNAL_LIBRARY_COLUMNS)}>
      <ExternalLibraryPathButton
        disabled={disabled}
        emptyLabel={t('settings.externalSources.chooseFolder')}
        label={t('settings.externalSources.chooseFolder')}
        onClick={() => void props.onChooseFolder(props.folder.id)}
        path={props.folder.folderPath}
      />
      <ExternalLibraryPathButton
        disabled={disabled}
        emptyLabel={t('settings.externalSources.chooseFolder')}
        label={t('settings.externalSources.chooseAttachmentFolder')}
        onClick={() => void props.onChooseAttachmentRoot(props.folder.id)}
        path={props.folder.attachmentRootPath ?? ''}
      />
      <ExternalLibraryExcludedInput disabled={disabled} folder={props.folder} onUpdateFolder={props.onUpdateFolder} />
      <ExternalLibraryStatus folder={props.folder} />
      <ExternalLibraryRowActions
        disabled={disabled}
        folderId={props.folder.id}
        onDisconnectFolder={props.onDisconnectFolder}
        onRebuildIndex={props.onRebuildIndex}
        onRemoveFolder={props.onRemoveFolder}
      />
    </div>
  );
}
