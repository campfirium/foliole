import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type {
  ExternalSourceSettingsFolder,
  ExternalSourceSettingsFolderPatch
} from '../../../../shared/platform/externalSourceSettingsRepository';
import {
  SettingsErrorState,
  SettingsLoadingState,
  SettingsSection,
  SettingsStateAction
} from '../../../../shared/ui';

import { ExternalLibraryRow, ExternalLibraryTable } from './SettingsExternalSearchSectionParts';
import { SettingsRemoteExternalFolderRows } from './SettingsRemoteExternalFolderRows';

interface SettingsExternalSearchSectionProps {
  error: string | null;
  feedback: string | null;
  folders: ExternalSourceSettingsFolder[];
  isDesktopRuntime: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onAddFolder: () => void;
  onChooseAttachmentRoot: (folderId: string) => void;
  onChooseFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onRetryLoad: () => void;
  onSetFolderEnabled?: (folderId: string, enabled: boolean) => void;
  onUpdateFolder: (folderId: string, patch: ExternalSourceSettingsFolderPatch) => void;
  previewDesktopSettings?: boolean;
}

export function SettingsExternalSearchSection(props: SettingsExternalSearchSectionProps) {
  const t = useTranslation();
  const remoteFolders = props.folders.filter((folder) => folder.accessMode === 'remote_mirror');
  const localFolders = props.folders.filter((folder) => folder.accessMode !== 'remote_mirror');

  if (props.isLoading) {
    return (
      <SettingsSection
        ariaLabel={t('settings.externalSources.sectionAria')}
        description={t('settings.externalSources.description')}
        title={t('settings.externalSources.title')}
      >
        <SettingsLoadingState />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      ariaLabel={t('settings.externalSources.sectionAria')}
      description={t('settings.externalSources.description')}
      title={t('settings.externalSources.title')}
    >
      <div className="min-w-0 overflow-hidden">
        {remoteFolders.length > 0 ? (
          <SettingsRemoteExternalFolderRows
            folders={remoteFolders}
            onSetEnabled={props.onSetFolderEnabled ?? (() => undefined)}
          />
        ) : null}
        <ExternalLibraryTable
          folders={localFolders}
          isDesktopRuntime={props.isDesktopRuntime || Boolean(props.previewDesktopSettings)}
          isSaving={props.isSaving}
          onAddFolder={props.onAddFolder}
        >
          {localFolders.map((folder) => (
            <ExternalLibraryRow
              folder={folder}
              isSaving={props.isSaving}
              key={folder.id}
              onChooseAttachmentRoot={props.onChooseAttachmentRoot}
              onChooseFolder={props.onChooseFolder}
              onRebuildIndex={props.onRebuildIndex}
              onRemoveFolder={props.onRemoveFolder}
              onUpdateFolder={props.onUpdateFolder}
            />
          ))}
        </ExternalLibraryTable>
      </div>
      {props.error ? (
        <SettingsErrorState
          action={<SettingsStateAction label={t('settings.externalSources.retry')} onClick={props.onRetryLoad} />}
          description={props.error}
          title={t('settings.externalSources.unavailable')}
        />
      ) : null}
    </SettingsSection>
  );
}
