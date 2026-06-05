import { Trash2 } from 'lucide-react';

import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { normalizeWorkspaceContentSort } from './workspaceContentSort';
import { WorkspaceContentSortControls } from './WorkspaceContentSortControls';

export function TrashResultHeader(props: {
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  isSearchOpen: boolean;
  onCloseSearch: () => void;
  onOpenSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  normalizedSort: ReturnType<typeof normalizeWorkspaceContentSort>;
  searchQuery: string;
  trashedNodeIds: string[];
}) {
  const t = useTranslation();
  const deleteNodesPermanently = useWorkspaceStore((state) => state.deleteNodesPermanently);
  return (
    <AppToolbar as="header" className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4">
      {renderSearchLauncher(props.onOpenSearch)}
      <ToolbarActionGroup ariaLabel={t('desktop.nodeList.actions.trash')}>
        <WorkspaceContentSortControls
          onChangeSortDirection={props.contentSort.setSortDirection}
          onChangeSortKey={props.contentSort.setSortKey}
          options={[
            { key: 'deletedAt', label: t('desktop.nodeList.trash.sort.deletedTime') },
            { key: 'name', label: t('desktop.nodeList.trash.sort.name') }
          ]}
          sortDirection={props.normalizedSort.direction}
          sortKey={props.normalizedSort.key}
        />
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          disabled={props.trashedNodeIds.length === 0}
          icon={<Trash2 size={16} strokeWidth={1.9} />}
          label={t('desktop.nodeList.emptyTrash')}
          onClick={() => deleteNodesPermanently(props.trashedNodeIds)}
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
