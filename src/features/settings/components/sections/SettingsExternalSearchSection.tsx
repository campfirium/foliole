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
  onUpdateFolder: (folderId: string, patch: ExternalSourceSettingsFolderPatch) => void;
}

export function SettingsExternalSearchSection(props: SettingsExternalSearchSectionProps) {
  if (props.isLoading) {
    return (
      <SettingsSection
        ariaLabel="External sources section"
        description="Choose folders Foliole mirrors for browsing, search, and import. Original files stay outside Foliole."
        title="External sources"
      >
        <SettingsLoadingState />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      ariaLabel="External sources section"
      description="Choose folders Foliole mirrors for browsing, search, and import. Original files stay outside Foliole."
      title="External sources"
    >
      <div className="min-w-0 overflow-hidden">
        <ExternalLibraryTable
          folders={props.folders}
          isDesktopRuntime={props.isDesktopRuntime}
          isSaving={props.isSaving}
          onAddFolder={props.onAddFolder}
        >
          {props.folders.map((folder) => (
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
          action={<SettingsStateAction label="Retry" onClick={props.onRetryLoad} />}
          description={props.error}
          title="External sources unavailable"
        />
      ) : null}
    </SettingsSection>
  );
}
