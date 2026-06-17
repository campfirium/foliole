import { ChevronRight, FileText, Folder, FolderOpen, Inbox, Sparkles, Trash2, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import { definedProps } from '../shared/lib/definedProps';
import { useTranslation } from '../shared/localization/LocalizationProvider';
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
  INBOX_NODE_ID,
  resolveDirectorySections
} from './CompanionDirectoryModel';
import { resolveDirectoryParentSelection } from './CompanionDirectoryParentModel';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { CompanionScreenHeader } from './CompanionScreenHeader';
import { useCompanionExternalDirectory, useCompanionExternalDocument } from './useCompanionExternalDirectory';

export type { CompanionDirectorySelection } from './CompanionDirectoryModel';

function resolveDirectoryRowIcon(item: DirectoryListItem): { Icon: LucideIcon; isAccent: boolean } {
  if (item.source === 'trashRoot' || item.source === 'trash') {
    return { Icon: item.kind === 'folder' ? Folder : Trash2, isAccent: false };
  }
  if (item.source === 'virtual') return { Icon: Sparkles, isAccent: false };
  if (item.source === 'externalFolder' || item.source === 'externalDirectory') {
    return { Icon: FolderOpen, isAccent: false };
  }
  if (item.source === 'externalDocument') return { Icon: FileText, isAccent: false };
  if (item.nodeId === INBOX_NODE_ID) return { Icon: Inbox, isAccent: true };
  return { Icon: item.kind === 'folder' ? Folder : FileText, isAccent: false };
}

function DirectoryRowLeadIcon(props: { isAccent: boolean; Icon: LucideIcon }) {
  const Icon = props.Icon;
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
        props.isAccent ? 'bg-companion-accent-soft text-companion-accent' : 'bg-companion-subtle text-companion-text-secondary'
      }`}
    >
      <Icon className="h-[19px] w-[19px]" />
    </span>
  );
}

function DirectoryRow(props: {
  item: DirectoryListItem;
  onSelectItem(item: DirectoryListItem): void;
}) {
  const t = useTranslation();
  const title = props.item.source === 'trashRoot' ? t(props.item.titleKey) : props.item.title;
  const { Icon, isAccent } = resolveDirectoryRowIcon(props.item);
  return (
    <button
      aria-label={t(props.item.kind === 'folder' ? 'companion.directory.openFolder' : 'companion.directory.openTopic', {
        title
      })}
      className="flex min-h-14 w-full items-center gap-3 border-b border-companion-divider px-1 py-3 text-left transition-colors hover:bg-companion-subtle/60 active:bg-companion-subtle/80"
      onClick={() => props.onSelectItem(props.item)}
      type="button"
    >
      <DirectoryRowLeadIcon Icon={Icon} isAccent={isAccent} />
      <span className={`min-w-0 flex-1 text-base font-semibold text-foreground ${props.item.kind === 'folder' ? 'truncate' : 'line-clamp-2'}`}>{title}</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-companion-text-tertiary" />
    </button>
  );
}

function DirectoryList(props: {
  emptyLabel: string;
  onSelectItem(item: DirectoryListItem): void;
  sections: DirectorySection[];
}) {
  const t = useTranslation();
  if (props.sections.length === 0) {
    return (
      <div className="border-t border-companion-divider px-1 py-6">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.directory.emptyDescription')}
          title={props.emptyLabel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {props.sections.map((section, index) => (
        <section className={index === 0 ? '' : 'border-t border-companion-divider'} key={section.id}>
          {section.titleKey ? (
            <h2 className={`px-1 pb-2 text-[11.5px] font-bold uppercase tracking-[.07em] text-companion-text-tertiary ${index === 0 ? '' : 'pt-6'}`}>
              {t(section.titleKey)}
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
  const t = useTranslation();
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
      <CompanionScreenHeader title={t('companion.directory.title')} />
      <DirectoryList
        emptyLabel={folderView || virtualView ? t('companion.directory.emptyFolder') : t('companion.directory.emptyFolder')}
        onSelectItem={handleSelectItem}
        sections={sections}
      />
    </section>
  );
}
