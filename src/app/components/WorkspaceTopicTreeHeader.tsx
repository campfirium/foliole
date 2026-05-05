import { ChevronsDownUp, ChevronsUpDown, FilePlus2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

import type { WorkspaceContentSortDirection, WorkspaceContentSortKey } from './workspaceContentSort';
import { WorkspaceContentSortControls } from './WorkspaceContentSortControls';

interface WorkspaceTopicTreeHeaderProps {
  hasCollapsibleNodes: boolean;
  hasCollapsedNodes: boolean;
  onChangeSortDirection: (sortDirection: WorkspaceContentSortDirection) => void;
  onChangeSortKey: (sortKey: WorkspaceContentSortKey) => void;
  onCreateTopic: () => void;
  onSearchQueryChange: (searchQuery: string) => void;
  onToggleCollapseAll: () => void;
  searchQuery: string;
  sortDirection: WorkspaceContentSortDirection;
  sortKey: WorkspaceContentSortKey;
}

export function WorkspaceTopicTreeHeader({
  hasCollapsibleNodes,
  hasCollapsedNodes,
  onChangeSortDirection,
  onChangeSortKey,
  onCreateTopic,
  onToggleCollapseAll,
  onSearchQueryChange,
  searchQuery,
  sortDirection,
  sortKey
}: WorkspaceTopicTreeHeaderProps) {
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

  return (
    <AppToolbar
      as="header"
      className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4"
    >
      <h2 className="sr-only">Current folder topics</h2>
      {renderSearchLauncher(() => setIsSearchOpen(true))}
      <span aria-hidden="true" className="min-w-0 flex-1" />
      <WorkspaceTopicTreeHeaderActions
        hasCollapsibleNodes={hasCollapsibleNodes}
        hasCollapsedNodes={hasCollapsedNodes}
        onChangeSortDirection={onChangeSortDirection}
        onChangeSortKey={onChangeSortKey}
        onCreateTopic={onCreateTopic}
        onToggleCollapseAll={onToggleCollapseAll}
        sortDirection={sortDirection}
        sortKey={sortKey}
      />
      {isSearchOpen ? (
        <NodeListSearchOverlay
          onChangeSearchQuery={onSearchQueryChange}
          onClose={closeSearch}
          searchQuery={searchQuery}
        />
      ) : null}
    </AppToolbar>
  );
}

function WorkspaceTopicTreeHeaderActions(props: Omit<WorkspaceTopicTreeHeaderProps, 'onSearchQueryChange' | 'searchQuery'>) {
  return (
    <ToolbarActionGroup ariaLabel="Current folder topic actions">
      <WorkspaceContentSortControls
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        options={[
          { key: 'importedAt', label: 'Import time' },
          { key: 'lastOpenedAt', label: 'Last opened' },
          { key: 'name', label: 'Name' }
        ]}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
      />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={props.hasCollapsedNodes ? <ChevronsDownUp size={16} strokeWidth={1.9} /> : <ChevronsUpDown size={16} strokeWidth={1.9} />}
        disabled={!props.hasCollapsibleNodes}
        label={props.hasCollapsedNodes ? 'Expand all topics' : 'Collapse all topics'}
        onClick={props.onToggleCollapseAll}
      />
      <AppIconButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<FilePlus2 size={16} strokeWidth={1.9} />}
        label="Create topic"
        onClick={props.onCreateTopic}
      />
    </ToolbarActionGroup>
  );
}
