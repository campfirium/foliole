import { collectBacklinks } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { InspectorSection } from '../../shared/ui';

import { NodeBacklinksList } from './NodeBacklinksList';

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
  if (!props.activeNodeId) {
    return <EmptyBacklinksState description="Select a note to inspect which notes point back to it." />;
  }

  const node = props.nodesById[props.activeNodeId];
  if (!node) {
    return null;
  }

  const backlinks = collectBacklinks({
    targetNodeId: node.id,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <InspectorSection description={`Found ${backlinks.length} notes that mention this note.`} title="Backlinks">
        <NodeBacklinksList
          backlinks={backlinks}
          emptyLabel="No notes link back to this note yet."
          onSelectNode={props.onSelectNode}
        />
      </InspectorSection>
    </div>
  );
}
