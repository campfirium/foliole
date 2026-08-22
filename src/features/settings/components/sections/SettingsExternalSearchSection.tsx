import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { useActiveSyncGroupMembership } from '../../../../shared/platform/external/useActiveSyncGroupMembership';
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
  onDisconnectFolder: (folderId: string) => void;
  onReconnectFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onReplaceHost: (hostName: string) => void;
  onRetryLoad: () => void;
  onUpdateFolder: (folderId: string, patch: ExternalSourceSettingsFolderPatch) => void;
  previewDesktopSettings?: boolean;
}

function LocalExternalFolders(props: {
  folders: ExternalSourceSettingsFolder[];
  settings: SettingsExternalSearchSectionProps;
}) {
  const t = useTranslation();
  return (
    <>
      <div className="min-w-0 overflow-hidden">
        <ExternalLibraryTable
          folders={props.folders}
          isDesktopRuntime={props.settings.isDesktopRuntime || Boolean(props.settings.previewDesktopSettings)}
          isSaving={props.settings.isSaving}
          onAddFolder={props.settings.onAddFolder}
        >
          {props.folders.map((folder) => (
            <ExternalLibraryRow
              folder={folder}
              isSaving={props.settings.isSaving}
              key={folder.id}
              onChooseAttachmentRoot={props.settings.onChooseAttachmentRoot}
              onChooseFolder={props.settings.onReconnectFolder}
              onDisconnectFolder={props.settings.onDisconnectFolder}
              onRebuildIndex={props.settings.onRebuildIndex}
              onRemoveFolder={props.settings.onRemoveFolder}
              onUpdateFolder={props.settings.onUpdateFolder}
            />
          ))}
        </ExternalLibraryTable>
      </div>
      {props.settings.error ? (
        <SettingsErrorState
          action={<SettingsStateAction label={t('settings.externalSources.retry')} onClick={props.settings.onRetryLoad} />}
          description={props.settings.error}
          title={t('settings.externalSources.unavailable')}
        />
      ) : null}
    </>
  );
}

export function SettingsExternalSearchSection(props: SettingsExternalSearchSectionProps) {
  const t = useTranslation();
  const hasActiveSyncGroup = useActiveSyncGroupMembership();
  const remoteFolders = props.folders.filter((folder) => folder.accessMode !== 'local');
  const localFolders = props.folders.filter((folder) => folder.accessMode === 'local');

  if (props.isLoading) {
    return (
      <SettingsSection
        ariaLabel={t('settings.externalSources.sectionAria')}
      >
        <SettingsLoadingState />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      ariaLabel={t('settings.externalSources.sectionAria')}
      className={hasActiveSyncGroup && remoteFolders.length > 0 ? 'before:hidden' : ''}
    >
      {hasActiveSyncGroup && remoteFolders.length > 0 ? (
        <SettingsRemoteExternalFolderRows
          folders={remoteFolders}
          onReconnectFolder={props.onReconnectFolder}
          onRemoveFolder={props.onRemoveFolder}
          onReplaceHost={props.onReplaceHost}
        />
      ) : null}
      <LocalExternalFolders folders={localFolders} settings={props} />
    </SettingsSection>
  );
}
