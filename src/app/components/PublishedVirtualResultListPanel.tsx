import type { Node } from '../../features/nodes/model/nodeTypes';
import { useLocalization } from '../../shared/localization/LocalizationProvider';
import { defaultSystemEntryDisplayName } from '../../shared/localization/systemEntryNames';
import { AppButton, AppErrorState, AppLoadingState } from '../../shared/ui';

import { useFoliolePublishedTopics } from './useFoliolePublishedTopics';
import { VirtualResultListPanel } from './VirtualResultListPanel';

export function PublishedVirtualResultListPanel(props: {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  trashedNodeIds: string[];
}) {
  const { locale, t } = useLocalization();
  const title = defaultSystemEntryDisplayName(locale, 'published');
  const state = useFoliolePublishedTopics(props);
  if (state.error) {
    return <AppErrorState action={<AppButton onClick={() => void state.load()}>{t('desktop.document.retry')}</AppButton>} description={state.error} title={title} />;
  }
  if (!state.topics) return <AppLoadingState title={title} />;
  return (
    <VirtualResultListPanel
      activeNodeId={props.activeNodeId}
      emptyState={{ description: t('desktop.virtualSearch.published.empty.description'), title: t('desktop.virtualSearch.published.empty.title') }}
      header={{ kind: 'description', text: '', title }}
      nodeOrder={props.nodeOrder}
      nodes={state.nodes}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
    />
  );
}
