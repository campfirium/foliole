import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { collectBacklinks, type BacklinkItem } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { loadRuntimeNodeBacklinks } from '../../shared/platform/nodeBacklinksRuntimeRepository';
import { onWorkspaceContentChanged, onWorkspaceSyncApplied } from '../../shared/platform/runtimeShellEvents';
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

interface RuntimeBacklinksState {
  errorMessage: string;
  isLoading: boolean;
  libraryScope: string | undefined;
  targetNodeId: string | null;
  value: BacklinkItem[] | null;
}

const EMPTY_RUNTIME_BACKLINKS_STATE: RuntimeBacklinksState = {
  errorMessage: '',
  isLoading: false,
  libraryScope: undefined,
  targetNodeId: null,
  value: null
};

function startRuntimeBacklinksLoad(
  targetNodeId: string | null,
  libraryScope: string | undefined,
  setRuntimeState: Dispatch<SetStateAction<RuntimeBacklinksState>>
) {
  if (!targetNodeId) {
    setRuntimeState(EMPTY_RUNTIME_BACKLINKS_STATE);
    return () => undefined;
  }

  let generation = 0;
  let disposed = false;
  const unlisteners: (() => void)[] = [];
  const reload = () => {
    const request = ++generation;
    setRuntimeState(current => ({ errorMessage: '', isLoading: true, targetNodeId, libraryScope,
      value: current.targetNodeId === targetNodeId && current.libraryScope === libraryScope ? current.value : null }));
    void loadRuntimeNodeBacklinks(targetNodeId).then(value => {
      if (!disposed && request === generation) {
        setRuntimeState({ errorMessage: '', isLoading: false, targetNodeId, libraryScope, value });
      }
    }).catch(() => {
      if (!disposed && request === generation) {
        setRuntimeState(current => ({ ...current, errorMessage: 'Backlinks could not be loaded.', isLoading: false }));
      }
    });
  };
  const changed = (payload: { libraryScope?: string }) => {
    if (!disposed && (!payload.libraryScope || !libraryScope || payload.libraryScope === libraryScope)) reload();
  };
  reload();
  for (const subscribe of [onWorkspaceContentChanged, onWorkspaceSyncApplied]) {
    void subscribe(changed).then(unlisten => {
      if (disposed) unlisten?.();
      else if (unlisten) unlisteners.push(unlisten);
    });
  }
  return () => {
    disposed = true;
    unlisteners.forEach(unlisten => unlisten());
  };
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
  const [refreshKey, setRefreshKey] = useState(0);

  const retry = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    return startRuntimeBacklinksLoad(args.targetNodeId, libraryScope, setRuntimeState);
  }, [args.targetNodeId, libraryScope, refreshKey]);

  const isCurrentRuntimeState = runtimeState.targetNodeId === args.targetNodeId && runtimeState.libraryScope === libraryScope;
  return {
    errorMessage: isCurrentRuntimeState ? runtimeState.errorMessage : '',
    isLoading: isCurrentRuntimeState ? runtimeState.isLoading : false,
    retry,
    value: isCurrentRuntimeState ? runtimeState.value ?? localBacklinks : localBacklinks
  };
}
