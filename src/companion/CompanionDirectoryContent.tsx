import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { FolderListSortDirection, FolderListSortKey } from '../features/nodes/model/folderListOrdering';
import { definedProps } from '../shared/lib/definedProps';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionRootDirectoryView,
  resolveCompanionTrashFolderViewByNodeId,
  resolveCompanionTrashView
} from '../shared/platform/companionBrowseLists';

import { toReadableExternalArticle } from './CompanionDirectoryExternalArticle';
import { CompanionDirectoryList } from './CompanionDirectoryListSurface';
import {
  type CompanionDirectorySelection,
  type DirectoryListItem,
  resolveDirectorySections
} from './CompanionDirectoryModel';
import { resolveDirectoryParentSelection } from './CompanionDirectoryParentModel';
import { resolveDirectoryItemCount } from './CompanionDirectoryVisualModel';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { CompanionScreenHeader } from './CompanionScreenHeader';
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

function useCompanionDirectorySections(args: {
  directory: ReturnType<typeof useCompanionExternalDirectory>;
  selection: CompanionDirectorySelection;
  snapshot: WorkspaceSnapshot | null;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const currentNodeId = args.selection.kind === 'internal' ? args.selection.nodeId : null;
  const virtualNodeId = args.selection.kind === 'virtual' ? args.selection.nodeId : null;
  const trashFolderNodeId = args.selection.kind === 'trashFolder' ? args.selection.nodeId : null;
  const folderView = resolveCompanionFolderViewByNodeId(args.snapshot, currentNodeId, args.sortKey, args.sortDirection);
  const virtualView = resolveCompanionFolderViewByNodeId(args.snapshot, virtualNodeId, args.sortKey, args.sortDirection);
  const rootView = resolveCompanionRootDirectoryView(args.snapshot, args.sortKey, args.sortDirection);
  const trashView = trashFolderNodeId
    ? resolveCompanionTrashFolderViewByNodeId(args.snapshot, trashFolderNodeId, args.sortKey, args.sortDirection)
    : resolveCompanionTrashView(args.snapshot, args.sortKey, args.sortDirection);
  const sections = useMemo(
    () =>
      resolveDirectorySections({
        directory: args.directory,
        folderView: folderView ?? virtualView,
        rootView,
        selection: args.selection,
        snapshot: args.snapshot,
        ...definedProps({ trashView: trashView ?? undefined })
      }),
    [args.directory, args.selection, args.snapshot, folderView, rootView, trashView, virtualView]
  );

  return { sections };
}

function resolveItemSelection(item: DirectoryListItem): CompanionDirectorySelection {
  if (item.source === 'internal' || item.source === 'virtual') {
    return { kind: item.source, nodeId: item.nodeId };
  }
  if (item.source === 'trashRoot') return { kind: 'trash' };
  if (item.source === 'trash' && item.kind === 'folder') return { kind: 'trashFolder', nodeId: item.nodeId };
  if (item.source === 'trash') return { kind: 'trash' };
  if (item.source === 'externalFolder') return { folderId: item.nodeId, kind: 'externalFolder' };
  if (item.source === 'externalDirectory') {
    return {
      directoryPath: item.directoryPath,
      folderId: item.folderId,
      kind: 'externalDirectory'
    };
  }
  return { documentId: item.documentId, kind: 'externalDocument' };
}

export function CompanionDirectoryContent(props: CompanionDirectoryContentProps) {
  const t = useTranslation();
  const directory = useCompanionExternalDirectory();
  const externalDocument = useCompanionExternalDocument(props.selection);
  const { sections } = useCompanionDirectorySections({
    directory,
    selection: props.selection,
    snapshot: props.snapshot,
    sortDirection: props.sortDirection,
    sortKey: props.sortKey
  });
  const itemCount = resolveDirectoryItemCount(sections);
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
    const selection = resolveItemSelection(item);
    props.onChangeSelection(selection);
    if (selection.kind === 'internal' || selection.kind === 'virtual' || item.source === 'trash') {
      props.onSelectNode(item.nodeId);
    }
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

  return (
    <section className="px-1 py-3">
      <CompanionScreenHeader
        metric={t('companion.directory.header.count', { count: itemCount })}
        subtitle={t('companion.directory.header.subtitle')}
        title={t('companion.directory.title')}
      />
      <CompanionDirectoryList
        directory={directory}
        emptyLabel={t('companion.directory.emptyFolder')}
        onSelectItem={handleSelectItem}
        sections={sections}
        snapshot={props.snapshot}
      />
    </section>
  );
}
