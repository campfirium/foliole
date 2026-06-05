import { ChevronsDownUp, ChevronsUpDown, FolderPlus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FOLDER_TOPIC_ITEM_APP_COMMAND_IDS } from '../../../../lib/core/nodes/folderTopicItemCommands';
import { useTranslation, type Translate } from '../../../shared/localization/LocalizationProvider';
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
  t: Translate,
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
        label={hasCollapsedNodes ? t('desktop.nodeList.expandAll') : t('desktop.nodeList.collapseAll')}
        onClick={onToggleCollapseAll}
      />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<FolderPlus size={16} strokeWidth={1.9} />}
        label={t('desktop.nodeList.createFolder')}
        onClick={() => onCreateCommand(FOLDER_TOPIC_ITEM_APP_COMMAND_IDS.createFolder)}
      />
    </>
  );
}

function renderTrashActions(t: Translate, onEmptyTrash: () => void, trashCount: number) {
  return (
    <>
      <button aria-label={t('desktop.nodeList.create')} className="sr-only" type="button">
        {t('desktop.nodeList.create')}
      </button>
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        disabled={trashCount === 0}
        icon={<Trash2 size={16} strokeWidth={1.9} />}
        label={t('desktop.nodeList.emptyTrash')}
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
  const t = useTranslation();
  return (
    <AppToolbar
      as="header"
      className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 overflow-hidden px-4"
    >
      <h2 className="sr-only">{t('desktop.nodeList.title')}</h2>
      <button className="sr-only" onClick={args.onOpenNotesView} type="button">
        {t('desktop.nodeList.title')}
      </button>
      {args.showTitleSearch && !args.isVirtualViewOpen ? renderSearchLauncher(args.onOpenSearch) : <span aria-hidden="true" className="size-8" />}
      <span aria-hidden="true" className="min-w-0 flex-1" />
      <ToolbarActionGroup ariaLabel={args.isTrashViewOpen ? t('desktop.nodeList.actions.trash') : args.isVirtualViewOpen ? t('desktop.nodeList.actions.virtualFolder') : t('desktop.nodeList.actions.topicList')}>
        {args.isTrashViewOpen
          ? renderTrashActions(t, args.onEmptyTrash, args.trashCount)
          : args.isVirtualViewOpen
            ? null
            : renderNodeListActions(
                t,
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
