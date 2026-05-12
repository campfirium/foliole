import { RefreshCw } from 'lucide-react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import type { RuntimeRemovedSourceEntry } from '../../shared/platform/removedSourcesRuntimeRepository';
import { AppEmptyState, AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

export function RemovedSourcesToolbar(props: {
  isSearchOpen: boolean;
  loadEntries: () => Promise<void>;
  onCloseSearch: () => void;
  onOpenSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  searchQuery: string;
}) {
  return (
    <AppToolbar as="header" className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4">
      {renderSearchLauncher(props.onOpenSearch)}
      <ToolbarActionGroup ariaLabel="Removed actions">
        <AppIconButton
          icon={<RefreshCw size={15} strokeWidth={1.9} />}
          label="Refresh Removed"
          onClick={props.loadEntries}
        />
      </ToolbarActionGroup>
      {props.isSearchOpen ? (
        <NodeListSearchOverlay
          onChangeSearchQuery={props.onSearchQueryChange}
          onClose={props.onCloseSearch}
          searchQuery={props.searchQuery}
        />
      ) : null}
    </AppToolbar>
  );
}

export function RemovedSourceRows(props: {
  entries: RuntimeRemovedSourceEntry[];
  selectedId: string | null;
  onSelect: (entry: RuntimeRemovedSourceEntry) => void;
}) {
  const rowSpacing = getNodeListRowSpacing();
  if (props.entries.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center py-6">
        <AppEmptyState
          description="Removed keep or Readwise topics will appear here while their source still exists."
          title="No removed topics"
        />
      </div>
    );
  }
  return (
    <div aria-label="Removed topics" className="flex flex-col gap-2" role="tree">
      {props.entries.map((entry) => (
        <NodeTreeRow
          depth={0}
          hasChildren={false}
          isActive={props.selectedId === entry.id}
          isCollapsed={false}
          isDragDisabled
          isSelected={props.selectedId === entry.id}
          key={entry.id}
          label={entry.title}
          nodeId={entry.id}
          onKeyDown={() => undefined}
          onSelect={() => props.onSelect(entry)}
          onToggleCollapse={() => undefined}
          rowSpacing={rowSpacing}
          secondaryLabel={entry.sourcePath}
          showIcon={false}
          trailingLabelContent={entry.hasSourceUpdate ? <span className="text-xs text-foreground/55">Updated</span> : null}
        />
      ))}
    </div>
  );
}
