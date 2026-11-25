import { resolveExternalBrowseSelection, type ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { ExternalLibraryListPanel } from './ExternalLibraryListPanel';
import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';

export function renderExternalContentColumn(props: WorkspaceDualListContentProps) {
  const browseSelection = resolveExternalBrowseSelection(props.externalSelection);
  const aggregateScope = browseSelection.kind === 'root' || browseSelection.kind === 'group'
    ? browseSelection
    : undefined;
  const openSelection = (selection: ExternalLibrarySelection) => {
    props.onOpenExternalSelection(selection.kind === 'document' && aggregateScope
      ? { ...selection, aggregateScope }
      : selection);
  };
  return (
    <ExternalLibraryListPanel
      entriesByFolderId={props.externalEntriesByFolderId}
      folders={props.externalFolders}
      onOpenExternalSelection={openSelection}
      selection={props.externalSelection}
    />
  );
}
