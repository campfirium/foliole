import { useCallback, useEffect, useMemo, useState } from 'react';

import { collectBacklinks } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  EMPTY_RUNTIME_BACKLINKS_STATE, refreshRuntimeBacklinks, subscribeRuntimeBacklinks,
  type RuntimeBacklinksState
} from '../../shared/platform/desktop/nodeBacklinksRuntimeLoad';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';

function collectLocalBacklinks(args: {
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  targetNodeId: string | null;
  trashedNodeIds: string[];
}) {
  if (!args.targetNodeId) {
    return [];
  }
  return collectBacklinks({
    targetNodeId: args.targetNodeId,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    trashedNodeIds: args.trashedNodeIds
  });
}

export function useNodeBacklinks(args: {
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  targetNodeId: string | null;
  trashedNodeIds: string[];
}) {
  const libraryScope = useWorkspaceStore(state => state.libraryScope);
  const localBacklinks = useMemo(
    () => measureWorkspaceDiagnostic(
      'node-backlinks-local-collect',
      {
        nodeCount: args.nodeOrder.length,
        targetNodeId: args.targetNodeId
      },
      () => collectLocalBacklinks(args)
    ),
    [args.nodeOrder, args.nodesById, args.targetNodeId, args.trashedNodeIds]
  );
  const [runtimeState, setRuntimeState] = useState<RuntimeBacklinksState>(EMPTY_RUNTIME_BACKLINKS_STATE);
  const retry = useCallback(() => {
    if (args.targetNodeId) refreshRuntimeBacklinks(args.targetNodeId, libraryScope);
  }, [args.targetNodeId, libraryScope]);

  useEffect(() => {
    if (args.targetNodeId) return subscribeRuntimeBacklinks(args.targetNodeId, libraryScope, setRuntimeState);
    setRuntimeState(EMPTY_RUNTIME_BACKLINKS_STATE);
  }, [args.targetNodeId, libraryScope]);

  const isCurrentRuntimeState = runtimeState.targetNodeId === args.targetNodeId && runtimeState.libraryScope === libraryScope;
  return {
    errorMessage: isCurrentRuntimeState ? runtimeState.errorMessage : '',
    isLoading: isCurrentRuntimeState ? runtimeState.isLoading : false,
    hasLoaded: isCurrentRuntimeState && runtimeState.value !== null,
    retry,
    value: isCurrentRuntimeState ? runtimeState.value ?? localBacklinks : localBacklinks
  };
}
