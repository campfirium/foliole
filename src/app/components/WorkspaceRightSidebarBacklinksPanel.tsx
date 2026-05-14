import type { Node } from '../../features/nodes/model/nodeTypes';
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
  return <InspectorSection description={description} title="Backlinks" />;
}

function BacklinksErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <AppErrorState
      action={<AppButton onClick={onRetry}>Retry</AppButton>}
      description="Refresh backlinks for this topic."
      title="Backlinks could not be loaded"
    />
  );
}

export function WorkspaceRightSidebarBacklinksPanel(props: WorkspaceRightSidebarBacklinksPanelProps) {
  const node = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  const backlinks = useNodeBacklinks({
    targetNodeId: node?.id ?? null,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });

  if (!props.activeNodeId) {
    return <EmptyBacklinksState description="Select a topic to inspect which topics point back to it." />;
  }

  if (!node) {
    return <AppErrorState description="The selected topic is no longer available." title="Topic unavailable" />;
  }

  if (backlinks.errorMessage && backlinks.value.length === 0) {
    return <BacklinksErrorState onRetry={backlinks.retry} />;
  }

  if (backlinks.isLoading && backlinks.value.length === 0) {
    return <AppLoadingState description="Checking topics that point back to this topic." title="Loading backlinks" />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {backlinks.errorMessage ? <BacklinksErrorState onRetry={backlinks.retry} /> : null}
      <InspectorSection description={`Found ${backlinks.value.length} topics that mention this topic.`} title="Backlinks">
        <NodeBacklinksList
          backlinks={backlinks.value}
          emptyLabel="No topics link back to this topic yet."
          onSelectNode={props.onSelectNode}
        />
      </InspectorSection>
    </div>
  );
}
