import { useEffect, useMemo } from 'react';

import { VIRTUAL_PUBLISHED_NODE_ID, VIRTUAL_REMOVED_NODE_ID, VIRTUAL_SHELVED_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { FolderListSortDirection, FolderListSortKey } from '../features/nodes/model/folderListOrdering';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { retainCompanionOpenVirtualFolder } from '../shared/platform/companion/browse/companionOpenVirtualFolders';
import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionTrashFolderViewByNodeId
} from '../shared/platform/companionBrowseLists';
import { AppButton } from '../shared/ui';

import { useCompanionArticleExit } from './CompanionArticleTransition';
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
  articleOnly?: boolean;
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

const virtualEmptyCopy = {
  [VIRTUAL_PUBLISHED_NODE_ID]: {
    title: 'desktop.virtualSearch.published.empty.title',
    description: 'desktop.virtualSearch.published.empty.description'
  },
  [VIRTUAL_SHELVED_NODE_ID]: {
    title: 'desktop.virtualSearch.shelved.empty.title',
    description: 'desktop.virtualSearch.shelved.empty.description'
  },
  [VIRTUAL_REMOVED_NODE_ID]: {
    title: 'desktop.virtualSearch.removed.empty.title',
    description: 'desktop.virtualSearch.removed.empty.description'
  }
} as const;

function CompanionDirectoryListContent(props: {
  directory: ReturnType<typeof useCompanionExternalDirectory>;
  handleSelectItem(item: DirectoryListItem): void;
  viewKey: string;
  selection: CompanionDirectorySelection;
  sections: ReturnType<typeof useCompanionDirectorySections>['sections'];
  snapshot: WorkspaceSnapshot | null;
}) {
  const t = useTranslation();
  const id = props.selection.kind === 'virtual' ? props.selection.nodeId : null;
  const copy = id === VIRTUAL_PUBLISHED_NODE_ID || id === VIRTUAL_SHELVED_NODE_ID || id === VIRTUAL_REMOVED_NODE_ID ? virtualEmptyCopy[id] : null;
  return (
    <section className="companion-page-start">
      <CompanionDirectoryList
        directory={props.directory}
        viewKey={props.viewKey}
        emptyLabel={t(copy?.title ?? 'companion.directory.emptyFolder')}
        emptyDescription={t(copy?.description ?? 'companion.directory.emptyDescription')}
        onSelectItem={props.handleSelectItem}
        sections={props.sections}
        snapshot={props.snapshot}
      />
    </section>
  );
}

export function CompanionDirectoryContent(props: CompanionDirectoryContentProps) {
  const t = useTranslation();
  const folderId = (props.selection.kind === 'virtual' || props.selection.kind === 'internal')
    && props.snapshot?.nodesById[props.selection.nodeId]?.virtualFilter ? props.selection.nodeId : null;
  useEffect(() => folderId ? retainCompanionOpenVirtualFolder(folderId) : undefined, [folderId]);
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
    const isContainer = isDirectoryContainer(item, props);
    if (
      item.source === 'internal' ||
      (item.source === 'virtual' && Boolean(props.snapshot?.nodesById[item.nodeId])) ||
      item.source === 'trash'
    ) {
      props.onSelectNode(item.nodeId);
    }
    if (!isContainer && item.source !== 'externalDocument') return;
    props.onChangeSelection(resolveItemSelection(item));
  };
  const exitPending = useCompanionArticleExit(() => props.onExitArticle(parentSelection ?? { kind: 'root' }));

  if (props.selection.kind === 'externalDocument' && externalDocument) {
    return (
      <ImmersiveReadableArticle
        onExit={() => props.onExitArticle(parentSelection ?? { kind: 'root' })}
        readableArticle={toReadableExternalArticle(externalDocument)}
        snapshot={null}
      />
    );
  }

  if (props.articleOnly) return <section aria-busy="true" className="fixed inset-0 z-surface-raised bg-companion-base px-4 pt-12">
    <AppButton onClick={exitPending} variant="ghost">
      {t('companion.back')}
    </AppButton>
  </section>;

  return <CompanionDirectoryListContent
    directory={directory}
    viewKey={`directory:${JSON.stringify(props.selection)}`}
    handleSelectItem={handleSelectItem}
    sections={sections}
    selection={props.selection}
    snapshot={props.snapshot}
  />;
}
