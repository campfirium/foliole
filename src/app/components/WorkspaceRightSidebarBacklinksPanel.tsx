import type { Node } from '../../features/nodes/model/nodeTypes';
import { InspectorSection } from '../../shared/ui';

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
    return null;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <InspectorSection description={`Found ${backlinks.length} topics that mention this topic.`} title="Backlinks">
        <NodeBacklinksList
          backlinks={backlinks}
          emptyLabel="No topics link back to this topic yet."
          onSelectNode={props.onSelectNode}
        />
      </InspectorSection>
    </div>
  );
}
