import { ExternalLibraryListPanel } from './ExternalLibraryListPanel';
import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';

export function renderExternalContentColumn(props: WorkspaceDualListContentProps) {
  return (
    <ExternalLibraryListPanel
      entriesByFolderId={props.externalEntriesByFolderId}
      folders={props.externalFolders}
      onOpenExternalSelection={props.onOpenExternalSelection}
      selection={props.externalSelection}
    />
  );
}
