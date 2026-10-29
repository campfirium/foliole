import { useCallback, useEffect, useRef, useState } from 'react';

import { useWorkspaceNodeLearning } from '../../shared/platform/runtime/useWorkspaceNodeLearning';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceState } from '../../store/workspaceStoreTypes';

type Target = { nodeId: string; scope: string | undefined; openedAt: string };

export function useReviewTopicDelayTarget(ws: Pick<WorkspaceState, 'activeNodeId' | 'nodesById' | 'trashedNodeIds'>) {
  const scope = useWorkspaceStore(state => state.libraryScope);
  const [target, setTarget] = useState<Target | null>(null);
  const current = useRef({ target, scope });
  current.current = { target, scope };
  const close = useCallback(() => setTarget(null), []);
  useEffect(close, [scope, close]);
  const onLoadError = useCallback(() => {
    close();
    showAppRuntimeNotice('Could not open Postpone. Please try again.');
  }, [close]);
  const source = target && target.scope === scope ? ws.nodesById[target.nodeId] : undefined;
  const learningNode = useWorkspaceNodeLearning(source, scope, onLoadError, target);
  const open = useCallback((nodeId?: string | null) => {
    const id = nodeId ?? ws.activeNodeId;
    const node = id ? ws.nodesById[id] : null;
    if (!id || !node || node.kind !== 'topic' || node.reading?.state === 'dismissed' || ws.trashedNodeIds.includes(id)) {
      showAppRuntimeNotice('Postpone is available for topics that have not been dismissed.');
      return false;
    }
    setTarget({ nodeId: id, scope, openedAt: new Date().toISOString() });
    return true;
  }, [scope, ws]);
  const isCurrent = useCallback((value: Target) => current.current.target === value && current.current.scope === value.scope, []);
  const refresh = useCallback((value: Target) => {
    if (isCurrent(value)) setTarget({ ...value });
  }, [isCurrent]);
  return { refresh, target: target?.scope === scope ? target : null, learningNode, close, open, isCurrent };
}
