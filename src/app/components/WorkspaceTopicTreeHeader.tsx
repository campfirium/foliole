import { useEffect, useState } from 'react';

import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

interface WorkspaceTopicTreeHeaderProps {
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSearchQueryChange: (searchQuery: string) => void;
  searchQuery: string;
}

export function WorkspaceTopicTreeHeader({
  onCollapseAll,
  onExpandAll,
  onSearchQueryChange,
  searchQuery
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
      <h2 className="sr-only">Current folder items</h2>
      {renderSearchLauncher(() => setIsSearchOpen(true))}
      <ToolbarActionGroup ariaLabel="Current folder item actions">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<ExpandAllIcon />}
          label="Expand all items"
          onClick={onExpandAll}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<CollapseAllIcon />}
          label="Collapse all items"
          onClick={onCollapseAll}
        />
      </ToolbarActionGroup>
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

function ExpandAllIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path
        d="M3.5 4.5h5M3.5 8h9M3.5 11.5h5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.05"
      />
      <path
        d="M10.5 2.8 13 5.4l-2.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}

function CollapseAllIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path
        d="M3.5 4.5h5M3.5 8h9M3.5 11.5h5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.05"
      />
      <path
        d="M12.9 2.8 10.4 5.4l2.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}
