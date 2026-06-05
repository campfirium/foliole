import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppErrorState, AppLoadingState, InspectorSection } from '../../shared/ui';

import { NodeBacklinksList } from './NodeBacklinksList';
import { useNodeBacklinks } from './useNodeBacklinks';

interface WorkspaceRightSidebarBacklinksPanelProps {
  activeNodeId: string | null;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

function EmptyBacklinksState({ description }: { description: string }) {
  const t = useTranslation();
  return <InspectorSection description={description} title={t('desktop.backlinks.title')} />;
}

function BacklinksErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslation();
  return (
    <AppErrorState
      action={<AppButton onClick={onRetry}>{t('desktop.backlinks.retry')}</AppButton>}
      description={t('desktop.backlinks.error.description')}
      title={t('desktop.backlinks.error.title')}
    />
  );
}

export function WorkspaceRightSidebarBacklinksPanel(props: WorkspaceRightSidebarBacklinksPanelProps) {
  const t = useTranslation();
  const node = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  const backlinks = useNodeBacklinks({
    targetNodeId: node?.id ?? null,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });

  if (!props.activeNodeId) {
    return <EmptyBacklinksState description={t('desktop.backlinks.empty.selectTopic')} />;
  }

  if (!node) {
    return <AppErrorState description={t('desktop.backlinks.topicUnavailable.description')} title={t('desktop.backlinks.topicUnavailable.title')} />;
  }

  if (backlinks.errorMessage && backlinks.value.length === 0) {
    return <BacklinksErrorState onRetry={backlinks.retry} />;
  }

  if (backlinks.isLoading && backlinks.value.length === 0) {
    return <AppLoadingState />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {backlinks.errorMessage ? <BacklinksErrorState onRetry={backlinks.retry} /> : null}
      <InspectorSection description={t('desktop.backlinks.found', { count: backlinks.value.length })} title={t('desktop.backlinks.title')}>
        <NodeBacklinksList
          backlinks={backlinks.value}
          emptyLabel={t('desktop.backlinks.empty.list')}
          onSelectNode={props.onSelectNode}
        />
      </InspectorSection>
    </div>
  );
}
