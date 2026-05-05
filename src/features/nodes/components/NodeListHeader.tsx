import { ChevronsDownUp, ChevronsUpDown, FolderPlus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FOLDER_TOPIC_ITEM_APP_COMMAND_IDS } from '../../../../lib/core/nodes/folderTopicItemCommands';
import {
  AppIconButton,
  AppToolbar,
  ToolbarActionGroup
} from '../../../shared/ui';

import { NodeListSearchOverlay, renderSearchLauncher } from './NodeListSearchOverlay';

interface NodeListHeaderProps {
  hasCollapsibleNodes: boolean;
  hasCollapsedNodes: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  showVirtualCreateAction?: boolean;
  onOpenNotesView: () => void;
  onCreateCommand: (commandId: string) => void;
  onEmptyTrash: () => void;
  onToggleCollapseAll: () => void;
  onSearchQueryChange: (searchQuery: string) => void;
  searchQuery: string;
  showTitleSearch?: boolean;
  trashCount: number;
}

function renderNodeListActions(
  hasCollapsibleNodes: boolean,
  hasCollapsedNodes: boolean,
  onCreateCommand: (commandId: string) => void,
  onToggleCollapseAll: () => void
) {
  return (
    <>
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={
          hasCollapsedNodes ? (
            <ChevronsDownUp size={16} strokeWidth={1.9} />
          ) : (
            <ChevronsUpDown size={16} strokeWidth={1.9} />
          )
        }
        disabled={!hasCollapsibleNodes}
        label={hasCollapsedNodes ? 'Expand all' : 'Collapse all'}
        onClick={onToggleCollapseAll}
      />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<FolderPlus size={16} strokeWidth={1.9} />}
        label="Create folder"
        onClick={() => onCreateCommand(FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createFolder)}
      />
    </>
  );
}

function renderTrashActions(onEmptyTrash: () => void, trashCount: number) {
  return (
    <>
      <button aria-label="Create" className="sr-only" type="button">
        Create
      </button>
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        disabled={trashCount === 0}
        icon={<Trash2 size={16} strokeWidth={1.9} />}
        label="Empty trash"
        onClick={onEmptyTrash}
      />
    </>
  );
}

function shouldHideNodeListHeader(args: {
  isVirtualViewOpen: boolean;
  showTitleSearch: boolean;
  showVirtualCreateAction: boolean;
}) {
  return args.isVirtualViewOpen && !args.showTitleSearch;
}

function renderNodeListHeaderShell(args: {
  closeSearch: () => void;
  hasCollapsibleNodes: boolean;
  hasCollapsedNodes: boolean;
  isSearchOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  onCreateCommand: (commandId: string) => void;
  onEmptyTrash: () => void;
  onOpenSearch: () => void;
  onOpenNotesView: () => void;
  onSearchQueryChange: (searchQuery: string) => void;
  onToggleCollapseAll: () => void;
  searchQuery: string;
  showTitleSearch: boolean;
  showVirtualCreateAction: boolean;
  trashCount: number;
}) {
  return (
    <AppToolbar
      as="header"
      className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 overflow-hidden px-4"
    >
      <h2 className="sr-only">Topics</h2>
      <button className="sr-only" onClick={args.onOpenNotesView} type="button">
        Topics
      </button>
      {args.showTitleSearch && !args.isVirtualViewOpen ? renderSearchLauncher(args.onOpenSearch) : <span aria-hidden="true" className="size-8" />}
      <span aria-hidden="true" className="min-w-0 flex-1" />
      <ToolbarActionGroup ariaLabel={args.isTrashViewOpen ? 'Trash actions' : args.isVirtualViewOpen ? 'Virtual folder actions' : 'Topic list actions'}>
        {args.isTrashViewOpen
          ? renderTrashActions(args.onEmptyTrash, args.trashCount)
          : args.isVirtualViewOpen
            ? null
            : renderNodeListActions(
                args.hasCollapsibleNodes,
                args.hasCollapsedNodes,
                args.onCreateCommand,
                args.onToggleCollapseAll
              )}
      </ToolbarActionGroup>
      {args.showTitleSearch && !args.isVirtualViewOpen && args.isSearchOpen ? (
        <NodeListSearchOverlay
          onChangeSearchQuery={args.onSearchQueryChange}
          onClose={args.closeSearch}
          searchQuery={args.searchQuery}
        />
      ) : null}
    </AppToolbar>
  );
}

export function NodeListHeader({
  hasCollapsibleNodes,
  hasCollapsedNodes,
  isTrashViewOpen,
  isVirtualViewOpen,
  showVirtualCreateAction = true,
  onOpenNotesView,
  onCreateCommand,
  onEmptyTrash,
  onToggleCollapseAll,
  onSearchQueryChange,
  searchQuery,
  showTitleSearch = true,
  trashCount
}: NodeListHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(Boolean(searchQuery));

  useEffect(() => {
    if (searchQuery) {
      setIsSearchOpen(true);
    }
  }, [searchQuery]);

  const closeSearch = () => {
    onSearchQueryChange('');
    setIsSearchOpen(false);
  };

  if (shouldHideNodeListHeader({ isVirtualViewOpen, showTitleSearch, showVirtualCreateAction })) {
    return null;
  }

  return renderNodeListHeaderShell({
    closeSearch,
    hasCollapsibleNodes,
    hasCollapsedNodes,
    isSearchOpen,
    isTrashViewOpen,
    isVirtualViewOpen,
    onCreateCommand,
    onEmptyTrash,
    onOpenSearch: () => setIsSearchOpen(true),
    onOpenNotesView,
    onSearchQueryChange,
    onToggleCollapseAll,
    searchQuery,
    showTitleSearch,
    showVirtualCreateAction,
    trashCount
  });
}
