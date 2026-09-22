import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { FolderListSortDirection, FolderListSortKey } from '../features/nodes/model/folderListOrdering';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionTrashFolderViewByNodeId
} from '../shared/platform/companionBrowseLists';

import { toReadableExternalArticle } from './CompanionDirectoryExternalArticle';
import { CompanionDirectoryList } from './CompanionDirectoryListSurface';
import {
  type CompanionDirectorySelection,
  type DirectoryListItem
} from './CompanionDirectoryModel';
import { resolveDirectoryParentSelection } from './CompanionDirectoryParentModel';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { useCompanionDirectorySections } from './useCompanionDirectorySections';
import { useCompanionExternalDirectory, useCompanionExternalDocument } from './useCompanionExternalDirectory';

export type { CompanionDirectorySelection } from './CompanionDirectoryModel';

interface CompanionDirectoryContentProps {
  selection: CompanionDirectorySelection;
  onChangeSelection(selection: CompanionDirectorySelection): void;
  onExitArticle(selection: CompanionDirectorySelection): void;
  onSelectNode(nodeId: string): void;
  snapshot: WorkspaceSnapshot | null;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}

function resolveItemSelection(item: DirectoryListItem): CompanionDirectorySelection {
  if (item.source === 'internal' || item.source === 'virtual') {
    return { kind: item.source, nodeId: item.nodeId };
  }
  if (item.source === 'trashRoot') return { kind: 'trash' };
  if (item.source === 'trash') return { kind: 'trashFolder', nodeId: item.nodeId };
  if (item.source === 'externalFolder') return { folderId: item.nodeId, kind: 'externalFolder' };
  if (item.source === 'externalDirectory') {
    return {
      directoryPath: item.directoryPath,
      folderId: item.folderId,
      kind: 'externalDirectory'
    };
  }
  if (item.source === 'externalDocument') return { documentId: item.documentId, kind: 'externalDocument' };
  return { kind: 'root' };
}

function isDirectoryContainer(
  item: DirectoryListItem,
  props: Pick<CompanionDirectoryContentProps, 'snapshot' | 'sortDirection' | 'sortKey'>
) {
  if (item.kind === 'folder') return true;
  if (item.source === 'internal' || item.source === 'virtual') {
    return Boolean(resolveCompanionFolderViewByNodeId(
      props.snapshot, item.nodeId, props.sortKey, props.sortDirection
    ));
  }
  if (item.source === 'trash') {
    return Boolean(resolveCompanionTrashFolderViewByNodeId(
      props.snapshot, item.nodeId, props.sortKey, props.sortDirection
    ));
  }
  return false;
}

function CompanionDirectoryListContent(props: {
  directory: ReturnType<typeof useCompanionExternalDirectory>;
  handleSelectItem(item: DirectoryListItem): void;
  viewKey: string;
  sections: ReturnType<typeof useCompanionDirectorySections>['sections'];
  snapshot: WorkspaceSnapshot | null;
}) {
  const t = useTranslation();
  return (
    <section>
      <CompanionDirectoryList
        directory={props.directory}
        viewKey={props.viewKey}
        emptyLabel={t('companion.directory.emptyFolder')}
        onSelectItem={props.handleSelectItem}
        sections={props.sections}
        snapshot={props.snapshot}
      />
    </section>
  );
}

export function CompanionDirectoryContent(props: CompanionDirectoryContentProps) {
  const directory = useCompanionExternalDirectory();
  const externalDocument = useCompanionExternalDocument(props.selection);
  const { sections } = useCompanionDirectorySections({
    directory,
    selection: props.selection,
    snapshot: props.snapshot,
    sortDirection: props.sortDirection,
    sortKey: props.sortKey
  });
  const parentSelection = useMemo(
    () =>
      resolveDirectoryParentSelection({
        directory,
        selection: props.selection,
        snapshot: props.snapshot
      }),
    [directory, props.selection, props.snapshot]
  );
  const handleSelectItem = (item: DirectoryListItem) => {
    if (
      item.source === 'internal' ||
      item.source === 'virtual' ||
      item.source === 'trash'
    ) {
      props.onSelectNode(item.nodeId);
    }
    if (!isDirectoryContainer(item, props)) return;
    props.onChangeSelection(resolveItemSelection(item));
  };

  if (props.selection.kind === 'externalDocument' && externalDocument) {
    return (
      <ImmersiveReadableArticle
        onExit={() => props.onExitArticle(parentSelection ?? { kind: 'root' })}
        readableArticle={toReadableExternalArticle(externalDocument)}
        snapshot={null}
      />
    );
  }

  return <CompanionDirectoryListContent
    directory={directory}
    viewKey={`directory:${JSON.stringify(props.selection)}`}
    handleSelectItem={handleSelectItem}
    sections={sections}
    snapshot={props.snapshot}
  />;
}
