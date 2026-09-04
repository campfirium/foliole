import { ChevronsDownUp, ChevronsUpDown, Focus, Scan, SquarePen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, AppToolbar, AppTooltip, AppTooltipContent, AppTooltipTrigger, ToolbarActionGroup } from '../../shared/ui';

import type { WorkspaceContentSortDirection, WorkspaceContentSortKey } from './workspaceContentSort';
import { WorkspaceContentSortControls } from './WorkspaceContentSortControls';

interface WorkspaceTopicTreeHeaderProps {
  hasCollapsibleNodes: boolean;
  hasCollapsedNodes: boolean;
  headerDescription?: string;
  onChangeSortDirection: (sortDirection: WorkspaceContentSortDirection) => void;
  onChangeSortKey: (sortKey: WorkspaceContentSortKey) => void;
  onCreateTopic: () => void;
  onToggleDismissedTopicsVisibility?: () => void;
  onSearchQueryChange: (searchQuery: string) => void;
  onToggleCollapseAll: () => void;
  searchQuery: string;
  showCreateTopic?: boolean;
  showTopicFocus?: boolean;
  viewHideDismissedTopics?: boolean;
  sortDirection: WorkspaceContentSortDirection;
  sortKey: WorkspaceContentSortKey;
}

function closeTopicSearch(onSearchQueryChange: (searchQuery: string) => void, setIsSearchOpen: (isOpen: boolean) => void) {
  onSearchQueryChange('');
  setIsSearchOpen(false);
}

export function WorkspaceTopicTreeHeader({
  hasCollapsibleNodes,
  hasCollapsedNodes,
  headerDescription,
  onChangeSortDirection,
  onChangeSortKey,
  onCreateTopic,
  onToggleDismissedTopicsVisibility = () => undefined,
  onToggleCollapseAll,
  onSearchQueryChange,
  searchQuery,
  showCreateTopic = true,
  showTopicFocus = true,
  sortDirection,
  sortKey,
  viewHideDismissedTopics = false
}: WorkspaceTopicTreeHeaderProps) {
  const t = useTranslation();
  const [isSearchOpen, setIsSearchOpen] = useState(Boolean(searchQuery));

  useEffect(() => {
    if (searchQuery) {
      setIsSearchOpen(true);
    }
  }, [searchQuery]);

  return (
    <AppToolbar
      as="header"
      className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4"
    >
      <h2 className="sr-only">{t('desktop.nodeList.currentFolderTopics')}</h2>
      <WorkspaceTopicTreeHeaderLead
        {...(headerDescription ? { description: headerDescription } : {})}
        onOpenSearch={() => setIsSearchOpen(true)}
      />
      <WorkspaceTopicTreeHeaderActions
        hasCollapsibleNodes={hasCollapsibleNodes}
        hasCollapsedNodes={hasCollapsedNodes}
        onChangeSortDirection={onChangeSortDirection}
        onChangeSortKey={onChangeSortKey}
        onCreateTopic={onCreateTopic}
        onToggleDismissedTopicsVisibility={onToggleDismissedTopicsVisibility}
        onToggleCollapseAll={onToggleCollapseAll}
        showCreateTopic={showCreateTopic}
        showTopicFocus={showTopicFocus}
        sortDirection={sortDirection}
        sortKey={sortKey}
        viewHideDismissedTopics={viewHideDismissedTopics}
      />
      {isSearchOpen ? (
        <NodeListSearchOverlay
          onChangeSearchQuery={onSearchQueryChange}
          onClose={() => closeTopicSearch(onSearchQueryChange, setIsSearchOpen)}
          searchQuery={searchQuery}
        />
      ) : null}
    </AppToolbar>
  );
}

function WorkspaceTopicTreeHeaderLead({
  description,
  onOpenSearch
}: {
  description?: string;
  onOpenSearch: () => void;
}) {
  if (description) {
    return (
      <p className="min-w-0 flex-1 truncate text-sm leading-6 text-foreground/62">
        {description}
      </p>
    );
  }
  return (
    <>
      {renderSearchLauncher(onOpenSearch)}
      <span aria-hidden="true" className="min-w-0 flex-1" />
    </>
  );
}

function WorkspaceTopicTreeHeaderActions(props: Omit<WorkspaceTopicTreeHeaderProps, 'onSearchQueryChange' | 'searchQuery'>) {
  const t = useTranslation();
  return (
    <ToolbarActionGroup ariaLabel={t('desktop.nodeList.currentFolderTopicActions')}>
      <WorkspaceContentSortControls
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        options={[
          { key: 'modifiedAt', label: t('desktop.sort.key.dateModified') },
          { key: 'lastOpenedAt', label: t('desktop.sort.key.lastOpened') },
          { key: 'importedAt', label: t('desktop.sort.fallback.dateImported') },
          { key: 'name', label: t('desktop.sort.key.name') },
          { key: 'manual', label: t('desktop.sort.key.manual') }
        ]}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
      />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={props.hasCollapsedNodes ? <ChevronsDownUp size={16} strokeWidth={1.9} /> : <ChevronsUpDown size={16} strokeWidth={1.9} />}
        disabled={!props.hasCollapsibleNodes}
        label={props.hasCollapsedNodes ? t('desktop.nodeList.expandAllTopics') : t('desktop.nodeList.collapseAllTopics')}
        onClick={props.onToggleCollapseAll}
      />
      {props.showTopicFocus !== false ? (
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <span className="inline-flex">
              <AppIconButton
                aria-pressed={props.viewHideDismissedTopics}
                className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground aria-pressed:text-foreground"
                icon={
                  props.viewHideDismissedTopics
                    ? <Focus size={16} strokeWidth={1.9} />
                    : <Scan size={16} strokeWidth={1.9} />
                }
                label={props.viewHideDismissedTopics ? t('desktop.nodeList.showAllTopics') : t('desktop.nodeList.focusActiveTopics')}
                onClick={props.onToggleDismissedTopicsVisibility}
              />
            </span>
          </AppTooltipTrigger>
          <AppTooltipContent align="center" avoidCollisions={false} side="top" sideOffset={8}>
            {props.viewHideDismissedTopics
              ? t('desktop.nodeList.showAllTopicBranches')
              : t('desktop.nodeList.focusActiveTopicsDescription')}
          </AppTooltipContent>
        </AppTooltip>
      ) : null}
      {props.showCreateTopic !== false ? (
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<SquarePen size={16} strokeWidth={1.9} />}
          label={t('desktop.nodeList.createTopicButton')}
          onClick={props.onCreateTopic}
        />
      ) : null}
    </ToolbarActionGroup>
  );
}
