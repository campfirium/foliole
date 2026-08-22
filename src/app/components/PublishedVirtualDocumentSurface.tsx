import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useLocalization } from '../../shared/localization/LocalizationProvider';
import { resolveSystemEntryDisplayName } from '../../shared/localization/systemEntryNames';
import { AppButton, AppErrorState, AppLoadingState } from '../../shared/ui';

import { FolderListView } from './FolderListView';
import { useFoliolePublishedTopics } from './useFoliolePublishedTopics';

export function PublishedVirtualDocumentSurface(props: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  onChangeSortDirection: (value: FolderListSortDirection) => void;
  onChangeSortKey: (value: FolderListSortKey) => void;
  onSelectNode: (nodeId: string) => void;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
  trashedNodeIds: string[];
}) {
  const { locale, t } = useLocalization();
  const state = useFoliolePublishedTopics(props);
  if (state.error) {
    return <AppErrorState action={<AppButton onClick={() => void state.load()}>{t('desktop.document.retry')}</AppButton>} description={state.error} title={t('desktop.virtualSearch.published.title')} />;
  }
  if (!state.topics) return <AppLoadingState title={t('desktop.virtualSearch.published.title')} />;
  const searchCopy = t('desktop.virtualSearch.published.description');
  return (
    <FolderListView
      activeNodeId={props.activeNodeId}
      emptyState={{ description: t('desktop.virtualSearch.published.empty.description'), title: t('desktop.virtualSearch.published.empty.title') }}
      folderTitle={resolveSystemEntryDisplayName(locale, 'published')}
      nodes={state.nodes}
      nodesById={props.nodesById}
      onChangeSortDirection={props.onChangeSortDirection}
      onChangeSortKey={props.onChangeSortKey}
      onSelectNode={props.onSelectNode}
      onSelectNodePath={props.onSelectNode}
      regionLabel={t('desktop.virtualSearch.published.region')}
      searchAriaLabel={searchCopy}
      searchPlaceholder={searchCopy}
      sortDirection={props.sortDirection}
      sortKey={props.sortKey}
    />
  );
}
