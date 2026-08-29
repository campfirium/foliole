import { useCallback } from 'react';

import type { useWorkspaceSelectors } from './appWorkspaceSelectors';
import { useExternalLibraryView } from './useExternalLibraryView';
import { useTrashView } from './useTrashView';
import { useVirtualNodeView } from './useVirtualNodeView';

type SpecialViewWorkspace = Pick<
  ReturnType<typeof useWorkspaceSelectors>,
  'browseRootNodeId' | 'nodesById' | 'setActiveNode' | 'setBrowseRootNode' | 'trashedNodeIds'
>;

export function useWorkspaceSpecialViews(ws: SpecialViewWorkspace) {
  const clearActiveNode = useCallback(() => ws.setActiveNode(null), [ws.setActiveNode]);
  const trash = useTrashView({ clearActiveNode, trashedNodeIds: ws.trashedNodeIds });
  const virtualView = useVirtualNodeView({
    browseRootNodeId: ws.browseRootNodeId,
    browseRootSpecialKind: ws.nodesById[ws.browseRootNodeId]?.specialKind,
    clearActiveNode,
    setBrowseRootNode: ws.setBrowseRootNode
  });
  const externalView = useExternalLibraryView(clearActiveNode);
  return { externalView, trash, virtualView };
}
