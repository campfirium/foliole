import { Plus, Trash2 } from 'lucide-react';
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
  settingsButtonClassName,
  settingsFieldClassName,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';

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
  folder: ExternalSourceSettingsFolder;
  onUpdateFolder: ExternalLibraryFolderUpdate;
}) {
  const t = useTranslation();

  return (
    <input
      aria-label={t('settings.externalSources.excludedForAria', { path: props.folder.folderPath })}
      className={settingsFieldClassName()}
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

function ExternalLibraryRowActions(props: {
  disabled: boolean;
  folderId: string;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
}) {
  const t = useTranslation();

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        aria-label={t('settings.externalSources.updateMirror')}
        className={settingsButtonClassName('h-9 px-3')}
        disabled={props.disabled}
        onClick={() => props.onRebuildIndex(props.folderId)}
        title={t('settings.externalSources.updateMirrorTitle')}
        type="button"
      >
        {t('settings.externalSources.update')}
      </button>
      <button
        aria-label={t('settings.externalSources.removeFolder')}
        className={settingsUtilityIconButtonClassName()}
        disabled={props.disabled}
        onClick={() => props.onRemoveFolder(props.folderId)}
        type="button"
      >
        <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
      </button>
    </div>
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

  return (
    <div className={settingsActionTableClassName()} role="table" aria-label={t('settings.externalSources.tableAria')}>
      <ExternalLibraryHeader />
      {props.isDesktopRuntime ? (
        <>
          {props.folders.length > 0 ? (
            props.children
          ) : (
            <ExternalLibraryDraftRow disabled={props.isSaving} onAddFolder={props.onAddFolder} />
          )}
          <ExternalLibraryAddRow disabled={props.isSaving} onAddFolder={props.onAddFolder} />
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
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onUpdateFolder: ExternalLibraryFolderUpdate;
}) {
  const t = useTranslation();

  return (
    <div className={settingsActionTableRowClassName(EXTERNAL_LIBRARY_COLUMNS)}>
      <ExternalLibraryPathButton
        disabled={props.isSaving}
        emptyLabel={t('settings.externalSources.chooseFolder')}
        label={t('settings.externalSources.chooseFolder')}
        onClick={() => void props.onChooseFolder(props.folder.id)}
        path={props.folder.folderPath}
      />
      <ExternalLibraryPathButton
        disabled={props.isSaving}
        emptyLabel={t('settings.externalSources.chooseFolder')}
        label={t('settings.externalSources.chooseAttachmentFolder')}
        onClick={() => void props.onChooseAttachmentRoot(props.folder.id)}
        path={props.folder.attachmentRootPath ?? ''}
      />
      <ExternalLibraryExcludedInput folder={props.folder} onUpdateFolder={props.onUpdateFolder} />
      <ExternalLibraryStatus folder={props.folder} />
      <ExternalLibraryRowActions
        disabled={props.isSaving}
        folderId={props.folder.id}
        onRebuildIndex={props.onRebuildIndex}
        onRemoveFolder={props.onRemoveFolder}
      />
    </div>
  );
}
