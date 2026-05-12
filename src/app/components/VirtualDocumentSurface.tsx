import { useMemo } from 'react';

import { VirtualNodeDetailView } from '../../features/nodes/components/VirtualNodeDetailView';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_REMOVED_NODE_ID, isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import { getVirtualRootResultNodes } from '../../features/nodes/model/virtualNodeDetail';

import { FolderListView } from './FolderListView';
import { RemovedSourcesPanel } from './RemovedSourcesPanel';

interface VirtualDocumentSurfaceProps {
  activeNode: Node;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath: (nodeId: string) => void;
  pdfCache: JSX.Element;
  trashedNodeIds: string[];
}

function VirtualRootAggregateView({
  nodeOrder,
  nodesById,
  onSelectNode,
  onSelectNodePath,
  trashedNodeIds
}: Pick<VirtualDocumentSurfaceProps, 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'onSelectNodePath' | 'trashedNodeIds'>) {
  const resultNodes = useMemo(
    () => getVirtualRootResultNodes(nodeOrder, nodesById, trashedNodeIds),
    [nodeOrder, nodesById, trashedNodeIds]
  );

  return (
    <section aria-label="Virtual folder details" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 max-[1080px]:px-2 max-[1080px]:py-2">
      <div className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-1 flex-col gap-4">
        <div className="px-1 pb-1">
          <h2 className="text-sm font-semibold text-foreground">Results</h2>
          <p className="mt-1 text-sm leading-6 text-foreground/68">
            Virtual shows the combined results from every virtual folder below it.
          </p>
        </div>
        <FolderListView
          emptyState={{
            description: 'Create and save a virtual folder below to add topics into this combined view.',
            title: 'No topics in Virtual yet'
          }}
          itemLayout="virtual-result"
          nodes={resultNodes}
          nodesById={nodesById}
          onSelectNode={onSelectNode}
          onSelectNodePath={onSelectNodePath}
          regionLabel="Folder list view"
        />
      </div>
    </section>
  );
}

export function VirtualDocumentSurface(props: VirtualDocumentSurfaceProps) {
  if (props.activeNode.id === VIRTUAL_REMOVED_NODE_ID) {
    return (
      <>
        {props.pdfCache}
        <RemovedSourcesPanel onSelectNode={props.onSelectNode} />
      </>
    );
  }

  if (isVirtualNode(props.activeNode)) {
    return (
      <>
        {props.pdfCache}
        <VirtualNodeDetailView
          node={props.activeNode}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          onSelectNodePath={props.onSelectNodePath}
          onUpdateFilter={props.onNodeContentChange}
        />
      </>
    );
  }

  if (isVirtualRootNode(props.activeNode)) {
    return (
      <>
        {props.pdfCache}
        <VirtualRootAggregateView
          nodeOrder={props.nodeOrder}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          onSelectNodePath={props.onSelectNodePath}
          trashedNodeIds={props.trashedNodeIds}
        />
      </>
    );
  }

  return null;
}
