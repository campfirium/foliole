import type { RuntimeExternalSearchFolder } from '../../../../shared/platform/externalSearchBridge';
import { SettingsSection } from '../../../../shared/ui';

import { ExternalLibraryRow, ExternalLibraryTable } from './SettingsExternalSearchSectionParts';

interface SettingsExternalSearchSectionProps {
  error: string | null;
  feedback: string | null;
  folders: RuntimeExternalSearchFolder[];
  isDesktopRuntime: boolean;
  isSaving: boolean;
  onAddFolder: () => void;
  onChooseAttachmentRoot: (folderId: string) => void;
  onChooseFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onUpdateFolder: (
    folderId: string,
    patch: Partial<Pick<RuntimeExternalSearchFolder, 'attachmentRootPath' | 'excludedDirs' | 'folderPath'>>
  ) => void;
}

export function SettingsExternalSearchSection(props: SettingsExternalSearchSectionProps) {
  return (
    <SettingsSection
      ariaLabel="External sources section"
      description="Search, preview, and import content from folders that stay outside Foliole until you choose to bring them in."
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
      {props.error ? <p className="text-sm text-error">{props.error}</p> : null}
    </SettingsSection>
  );
}
