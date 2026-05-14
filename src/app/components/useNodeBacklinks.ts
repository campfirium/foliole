import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { collectBacklinks, type BacklinkItem } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { loadRuntimeNodeBacklinks } from '../../shared/platform/nodeBacklinksRuntimeRepository';

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

interface RuntimeBacklinksState {
  errorMessage: string;
  isLoading: boolean;
  targetNodeId: string | null;
  value: BacklinkItem[] | null;
}

const EMPTY_RUNTIME_BACKLINKS_STATE: RuntimeBacklinksState = {
  errorMessage: '',
  isLoading: false,
  targetNodeId: null,
  value: null
};

function startRuntimeBacklinksLoad(
  targetNodeId: string | null,
  setRuntimeState: Dispatch<SetStateAction<RuntimeBacklinksState>>
) {
  if (!targetNodeId) {
    setRuntimeState(EMPTY_RUNTIME_BACKLINKS_STATE);
    return () => undefined;
  }

  let cancelled = false;
  setRuntimeState({
    errorMessage: '',
    isLoading: true,
    targetNodeId,
    value: null
  });
  void loadRuntimeNodeBacklinks(targetNodeId)
    .then((backlinks) => {
      if (!cancelled) {
        setRuntimeState({ errorMessage: '', isLoading: false, targetNodeId, value: backlinks });
      }
    })
    .catch(() => {
      if (!cancelled) {
        setRuntimeState({
          errorMessage: 'Backlinks could not be loaded.',
          isLoading: false,
          targetNodeId,
          value: null
        });
      }
    });

  return () => {
    cancelled = true;
  };
}

export function useNodeBacklinks(args: {
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  targetNodeId: string | null;
  trashedNodeIds: string[];
}) {
  const localBacklinks = useMemo(
    () => collectLocalBacklinks(args),
    [args.nodeOrder, args.nodesById, args.targetNodeId, args.trashedNodeIds]
  );
  const [runtimeState, setRuntimeState] = useState<RuntimeBacklinksState>(EMPTY_RUNTIME_BACKLINKS_STATE);
  const [refreshKey, setRefreshKey] = useState(0);

  const retry = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    return startRuntimeBacklinksLoad(args.targetNodeId, setRuntimeState);
  }, [args.targetNodeId, refreshKey]);

  const isCurrentRuntimeState = runtimeState.targetNodeId === args.targetNodeId;
  return {
    errorMessage: isCurrentRuntimeState ? runtimeState.errorMessage : '',
    isLoading: isCurrentRuntimeState ? runtimeState.isLoading : false,
    retry,
    value: isCurrentRuntimeState ? runtimeState.value ?? localBacklinks : localBacklinks
  };
}
