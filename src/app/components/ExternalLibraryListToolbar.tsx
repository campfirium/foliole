import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { rebuildExternalLibraryIndex } from '../../shared/platform/externalLibraryBrowseRepository';
import { AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';
import type { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import type { WorkspaceContentSortState } from './workspaceContentSort';
import { WorkspaceContentSortControls } from './WorkspaceContentSortControls';

interface ExternalLibraryListToolbarProps {
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  normalizedSort: WorkspaceContentSortState;
  onChangeSearchQuery: (query: string) => void;
  searchQuery: string;
  selection: ExternalLibrarySelection;
}

function useExternalDocumentListRefresh(selection: ExternalLibrarySelection) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const folderId = selection.kind === 'root' ? null : selection.folderId;

  return {
    folderId,
    isRefreshing,
    onRefresh: () => {
      if (!folderId || isRefreshing) return;
      setIsRefreshing(true);
      void rebuildExternalLibraryIndex(folderId).finally(() => setIsRefreshing(false));
    }
  };
}

export function ExternalLibraryListToolbar(props: ExternalLibraryListToolbarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const refresh = useExternalDocumentListRefresh(props.selection);

  return (
    <AppToolbar
      as="header"
      className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4"
    >
      {renderSearchLauncher(() => setIsSearchOpen(true))}
      <ToolbarActionGroup ariaLabel="External folder content actions">
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          disabled={!refresh.folderId || refresh.isRefreshing}
          icon={<RefreshCw className={refresh.isRefreshing ? 'animate-spin' : undefined} size={16} strokeWidth={1.9} />}
          label={refresh.isRefreshing ? 'Refreshing external documents' : 'Refresh external documents'}
          onClick={refresh.onRefresh}
        />
        <WorkspaceContentSortControls
          onChangeSortDirection={props.contentSort.setSortDirection}
          onChangeSortKey={props.contentSort.setSortKey}
          options={[
            { key: 'modifiedAt', label: 'Modified time' },
            { key: 'lastOpenedAt', label: 'Last opened' },
            { key: 'name', label: 'Name' }
          ]}
          sortDirection={props.normalizedSort.direction}
          sortKey={props.normalizedSort.key}
        />
      </ToolbarActionGroup>
      {isSearchOpen ? (
        <NodeListSearchOverlay
          onChangeSearchQuery={props.onChangeSearchQuery}
          onClose={() => {
            props.onChangeSearchQuery('');
            setIsSearchOpen(false);
          }}
          searchQuery={props.searchQuery}
        />
      ) : null}
    </AppToolbar>
  );
}
