import { ChevronDown, ChevronUp, FilePlus2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

interface WorkspaceTopicTreeHeaderProps {
  onCreateTopic: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSearchQueryChange: (searchQuery: string) => void;
  searchQuery: string;
}

export function WorkspaceTopicTreeHeader({
  onCreateTopic,
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
          icon={<ChevronDown size={16} strokeWidth={1.9} />}
          label="Expand all items"
          onClick={onExpandAll}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<ChevronUp size={16} strokeWidth={1.9} />}
          label="Collapse all items"
          onClick={onCollapseAll}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<FilePlus2 size={16} strokeWidth={1.9} />}
          label="Create topic"
          onClick={onCreateTopic}
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
