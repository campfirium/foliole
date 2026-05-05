import { useEffect, useState } from 'react';

import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../../lib/core/nodes/folderTopicItemCommands';
import { VIRTUAL_NODE_COMMAND } from '../../../../lib/core/nodes/virtualNodeCommands';
import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppIconButton,
  AppToolbar,
  ToolbarActionGroup
} from '../../../shared/ui';

import { CollapseAllIcon, ExpandAllIcon, NewNoteIcon } from './NodeListHeaderIcons';
import { NodeListSearchOverlay, renderSearchLauncher } from './NodeListSearchOverlay';

interface NodeListHeaderProps {
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  showVirtualCreateAction?: boolean;
  onOpenNotesView: () => void;
  onCreateCommand: (commandId: string) => void;
  onEmptyTrash: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSearchQueryChange: (searchQuery: string) => void;
  searchQuery: string;
  showTitleSearch?: boolean;
  trashCount: number;
}

function renderCreateMenu(onCreateCommand: (commandId: string) => void) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<NewNoteIcon />}
          label="Create"
        />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={6}>
        {FOLDER_TOPIC_ITEM_COMMANDS.map((command) => (
          <AppDropdownMenuItem key={command.appCommandId} onSelect={() => onCreateCommand(command.appCommandId)}>
            {command.listLabel}
          </AppDropdownMenuItem>
        ))}
        <AppDropdownMenuItem onSelect={() => onCreateCommand(VIRTUAL_NODE_COMMAND.appCommandId)}>
          {VIRTUAL_NODE_COMMAND.listLabel}
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function renderNodeListActions(
  onCollapseAll: () => void,
  onCreateCommand: (commandId: string) => void,
  onExpandAll: () => void
) {
  return (
    <>
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<ExpandAllIcon />}
        label="Expand all"
        onClick={onExpandAll}
      />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<CollapseAllIcon />}
        label="Collapse all"
        onClick={onCollapseAll}
      />
      {renderCreateMenu(onCreateCommand)}
    </>
  );
}

function renderVirtualListActions(onCreateCommand: (commandId: string) => void) {
  return (
    <AppButton
      aria-label="Create Virtual Folder"
      className="text-foreground/70 hover:text-foreground"
      onClick={() => onCreateCommand(VIRTUAL_NODE_COMMAND.appCommandId)}
      size="sm"
      variant="subtle"
    >
      {VIRTUAL_NODE_COMMAND.listLabel}
    </AppButton>
  );
}

function renderTrashActions(onEmptyTrash: () => void, trashCount: number) {
  return (
    <>
      <button aria-label="Create" className="sr-only" type="button">
        Create
      </button>
      <AppButton
        aria-label="Empty"
        className="text-foreground/70 hover:text-foreground"
        disabled={trashCount === 0}
        onClick={onEmptyTrash}
        size="sm"
        variant="subtle"
      >
        Empty
      </AppButton>
    </>
  );
}

function shouldHideNodeListHeader(args: {
  isVirtualViewOpen: boolean;
  showTitleSearch: boolean;
  showVirtualCreateAction: boolean;
}) {
  return args.isVirtualViewOpen && !args.showTitleSearch && !args.showVirtualCreateAction;
}

function renderNodeListHeaderShell(args: {
  closeSearch: () => void;
  isSearchOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  onCollapseAll: () => void;
  onCreateCommand: (commandId: string) => void;
  onEmptyTrash: () => void;
  onExpandAll: () => void;
  onOpenSearch: () => void;
  onOpenNotesView: () => void;
  onSearchQueryChange: (searchQuery: string) => void;
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
      <h2 className="sr-only">Nodes</h2>
      <button className="sr-only" onClick={args.onOpenNotesView} type="button">
        Nodes
      </button>
      {args.showTitleSearch && !args.isVirtualViewOpen ? renderSearchLauncher(args.onOpenSearch) : <span aria-hidden="true" className="size-8" />}
      <ToolbarActionGroup ariaLabel={args.isTrashViewOpen ? 'Trash actions' : args.isVirtualViewOpen ? 'Virtual folder actions' : 'Node list actions'}>
        {args.isTrashViewOpen
          ? renderTrashActions(args.onEmptyTrash, args.trashCount)
          : args.isVirtualViewOpen
            ? args.showVirtualCreateAction
              ? renderVirtualListActions(args.onCreateCommand)
              : null
            : renderNodeListActions(args.onCollapseAll, args.onCreateCommand, args.onExpandAll)}
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
  isTrashViewOpen,
  isVirtualViewOpen,
  showVirtualCreateAction = true,
  onOpenNotesView,
  onCreateCommand,
  onEmptyTrash,
  onCollapseAll,
  onExpandAll,
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
    isSearchOpen,
    isTrashViewOpen,
    isVirtualViewOpen,
    onCollapseAll,
    onCreateCommand,
    onEmptyTrash,
    onExpandAll,
    onOpenSearch: () => setIsSearchOpen(true),
    onOpenNotesView,
    onSearchQueryChange,
    searchQuery,
    showTitleSearch,
    showVirtualCreateAction,
    trashCount
  });
}
