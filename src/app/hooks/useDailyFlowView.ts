import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceRefreshScope } from '../../../lib/core/database/workspaceSnapshotRefresh';
import type { DailyFlowView } from '../../../lib/core/flow/dailyFlowViewContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { hasDailyFlowRuntime, loadDailyFlowViewRuntime } from '../../shared/platform/runtime/dailyFlowRuntimeRepository';
import { logRuntimeError } from '../../shared/platform/runtimeLogging';
import { onWorkspaceContentChanged, onWorkspaceSyncApplied } from '../../shared/platform/runtimeShellEvents';
import type { WorkspaceState } from '../../store/workspaceStoreTypes';

import { useDailyFlowNodeInput } from './useDailyFlowNodeInput';

type ViewContext = Pick<WorkspaceState, 'reviewSession' | 'reviewSessionMode' | 'nodesById'> & {
  trashedNodeIds?: string[] | undefined; nodeOrder?: string[] | undefined;
  libraryScope?: string | undefined; now: string; includeEntries: boolean; enabled: boolean;
};

export function useDailyFlowView(args: ViewContext) {
  const ownsSession = Boolean(args.reviewSession.daily);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!args.enabled) return;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const changed = (payload: { libraryScope?: string; workspaceScope?: WorkspaceRefreshScope; refreshWorkspace?: false }) => {
      if (disposed || (payload.refreshWorkspace === false && ownsSession) || (payload.libraryScope && payload.libraryScope !== args.libraryScope)) return;
      const scope = payload.workspaceScope;
      if (!scope || scope.kind === 'full' || scope.readingNodeIds?.length || scope.reviewNodeIds?.length) setRefresh(value => value + 1);
    };
    for (const subscribe of [onWorkspaceContentChanged, onWorkspaceSyncApplied]) {
      void subscribe(changed).then(unlisten => {
        if (disposed) unlisten?.();
        else if (unlisten) unlisteners.push(unlisten);
      });
    }
    return () => { disposed = true; unlisteners.forEach(unlisten => unlisten()); };
  }, [args.libraryScope, args.enabled, ownsSession]);
  const learningNodes = useDailyFlowNodeInput(args.nodesById);
  // Node updates refresh the read without withdrawing a valid view in this context.
  const context = useMemo(() => ({}), [args.libraryScope, args.reviewSession, args.reviewSessionMode,
    args.now, args.includeEntries, args.enabled]);
  const membership = JSON.stringify([args.nodeOrder, args.trashedNodeIds]);
  const request = useMemo(() => ({}), [context, learningNodes, membership, refresh]);
  const [result, setResult] = useState<{ request: object; context: object; view?: DailyFlowView; nodes?: Record<string, Node>;
    error?: string } | null>(null);
  useEffect(() => {
    if (!args.enabled || !hasDailyFlowRuntime()) return;
    let live = true;
    void loadDailyFlowViewRuntime({ now: args.now, mode: args.reviewSessionMode,
      includeEntries: args.includeEntries, continueNodeId: args.reviewSession.continueNodeId ?? null },
    args.reviewSession, args.nodesById).then(({ view, nodes }) => {
      if (args.libraryScope && args.libraryScope !== view.scope) return;
      if (live) setResult({ request, context, view, ...(nodes ? { nodes: nodes as Record<string, Node> } : {}) });
    }).catch(error => {
      logRuntimeError('could not read daily Flow', { area: 'persistence', action: 'read_daily_flow_view', error });
      if (live) setResult({ request, context, error: String(error) });
    });
    return () => { live = false; };
  }, [request]);
  if (result?.request === request) return result;
  return result?.context === context && result.view ? result : null;
}
