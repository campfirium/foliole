import { useMemo } from 'react';

import type { Dive } from '../../../lib/core/nodes/dive';
import { resolveDiveMembership } from '../../shared/diveMembership';
import { PanelScaleSurface } from '../../shared/ui';

import { FolderListView } from './FolderListView';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';

export function DiveDocumentSurface({ dive, workspace }: {
  dive: Dive;
  workspace: Pick<WorkspaceDocumentSurfaceProps,
    'nodeOrder' | 'nodesById' | 'trashedNodeIds' | 'onSelectNode' |
    'canGoBack' | 'canGoForward' | 'onGoBack' | 'onGoForward'>;
}) {
  const { nodeOrder, nodesById, trashedNodeIds } = workspace;
  const { id, directSourceIds, title } = dive;
  const nodes = useMemo(() => {
    const membership = resolveDiveMembership({ nodeOrder, nodesById, trashedNodeIds }, { id, directSourceIds, title });
    return membership.topics.flatMap(nodeId => {
      const node = nodesById[nodeId];
      return node ? [node] : [];
    });
  }, [directSourceIds, id, nodeOrder, nodesById, title, trashedNodeIds]);

  return (
    <PanelScaleSurface label="List panel" panelId="list-panel">
      <div className="workspace-region-main-document flex min-h-0 flex-1 flex-col">
        <FolderListView
          folderNodeId={id}
          folderTitle={title}
          mouseGesturesEnabled
          navigationOverlay={{
            canGoBack: workspace.canGoBack,
            canGoForward: workspace.canGoForward,
            onGoBack: workspace.onGoBack,
            onGoForward: workspace.onGoForward
          }}
          nodes={nodes}
          nodesById={nodesById}
          onSelectNode={workspace.onSelectNode}
        />
      </div>
    </PanelScaleSurface>
  );
}
