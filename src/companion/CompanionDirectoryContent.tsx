import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import { definedProps } from '../shared/lib/definedProps';
import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionRootDirectoryView,
  resolveCompanionTrashFolderViewByNodeId,
  resolveCompanionTrashView
} from '../shared/platform/companionBrowseLists';
import { AppEmptyState } from '../shared/ui';

import { toReadableExternalArticle } from './CompanionDirectoryExternalArticle';
import {
  type CompanionDirectorySelection,
  type DirectorySection,
  type DirectoryListItem,
  resolveDirectorySections
} from './CompanionDirectoryModel';
import { resolveDirectoryParentSelection } from './CompanionDirectoryParentModel';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { useCompanionExternalDirectory, useCompanionExternalDocument } from './useCompanionExternalDirectory';

export type { CompanionDirectorySelection } from './CompanionDirectoryModel';

function DirectoryRow(props: {
  item: DirectoryListItem;
  onSelectItem(item: DirectoryListItem): void;
}) {
  return (
    <button
      aria-label={`Open ${props.item.kind === 'folder' ? 'folder' : 'topic'} ${props.item.title}`}
      className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-companion-divider px-1 py-4 text-left transition-colors hover:bg-companion-subtle/60"
      onClick={() => props.onSelectItem(props.item)}
      type="button"
    >
      <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">{props.item.title}</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-companion-text-tertiary" />
    </button>
  );
}

function DirectoryList(props: {
  emptyLabel: string;
  onSelectItem(item: DirectoryListItem): void;
  sections: DirectorySection[];
}) {
  if (props.sections.length === 0) {
    return (
      <div className="border-t border-companion-divider px-1 py-6">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description="Add a topic or folder from desktop to see it here."
          title={props.emptyLabel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {props.sections.map((section, index) => (
        <section className={index === 0 ? '' : 'border-t border-companion-divider'} key={section.id}>
          {section.title ? (
            <h2 className={`px-1 pb-1 text-xs font-medium text-companion-text-tertiary ${index === 0 ? '' : 'pt-4'}`}>
              {section.title}
            </h2>
          ) : null}
          {section.items.map((item) => (
            <DirectoryRow item={item} key={item.id} onSelectItem={props.onSelectItem} />
          ))}
        </section>
      ))}
    </div>
  );
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
    () => resolveDirectorySections({
      directory: args.directory,
      folderView: folderView ?? virtualView,
      rootView,
      selection: args.selection,
      snapshot: args.snapshot,
      ...definedProps({ trashView: trashView ?? undefined })
    }),
    [args.directory, args.selection, args.snapshot, folderView, rootView, trashView, virtualView]
  );

  return { folderView, sections, virtualView };
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
    return { directoryPath: item.directoryPath, folderId: item.folderId, kind: 'externalDirectory' };
  }
  return { documentId: item.documentId, kind: 'externalDocument' };
}

export function CompanionDirectoryContent(props: {
  selection: CompanionDirectorySelection;
  onChangeSelection(selection: CompanionDirectorySelection): void;
  onSelectNode(nodeId: string): void;
  snapshot: WorkspaceSnapshot | null;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const directory = useCompanionExternalDirectory();
  const externalDocument = useCompanionExternalDocument(props.selection);
  const { folderView, sections, virtualView } = useCompanionDirectorySections({
    directory,
    selection: props.selection,
    snapshot: props.snapshot,
    sortDirection: props.sortDirection,
    sortKey: props.sortKey
  });
  const parentSelection = useMemo(
    () => resolveDirectoryParentSelection({ directory, selection: props.selection, snapshot: props.snapshot }),
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
        onExit={() => props.onChangeSelection(parentSelection ?? { kind: 'root' })}
        readableArticle={toReadableExternalArticle(externalDocument)}
        snapshot={null}
      />
    );
  }

  return (
    <section className="px-1 py-4">
      <DirectoryList
        emptyLabel={folderView || virtualView ? 'This folder is empty' : 'This folder is empty'}
        onSelectItem={handleSelectItem}
        sections={sections}
      />
    </section>
  );
}
