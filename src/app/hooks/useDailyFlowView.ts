import { useEffect, useMemo, useState } from 'react';

import type { DailyFlowView } from '../../../lib/core/flow/dailyFlowViewContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { hasDailyFlowRuntime, loadDailyFlowViewRuntime } from '../../shared/platform/runtime/dailyFlowRuntimeRepository';
import { logRuntimeError } from '../../shared/platform/runtimeLogging';
import type { WorkspaceState } from '../../store/workspaceStoreTypes';

type ViewContext = Pick<WorkspaceState, 'reviewSession' | 'reviewSessionMode' | 'nodesById'> & {
  libraryScope?: string | undefined; now: string; includeEntries: boolean; enabled: boolean;
};

export function useDailyFlowView(args: ViewContext) {
  const request = useMemo(() => ({}), [args.libraryScope, args.reviewSession, args.reviewSessionMode,
    args.nodesById, args.now, args.includeEntries, args.enabled]);
  const [result, setResult] = useState<{ request: object; view?: DailyFlowView; nodes?: Record<string, Node>;
    error?: string } | null>(null);
  useEffect(() => {
    if (!args.enabled || !hasDailyFlowRuntime()) return;
    let live = true;
    void loadDailyFlowViewRuntime({ now: args.now, mode: args.reviewSessionMode,
      includeEntries: args.includeEntries, continueNodeId: args.reviewSession.continueNodeId ?? null },
    args.reviewSession, args.nodesById).then(({ view, nodes }) => {
      if (args.libraryScope && args.libraryScope !== view.scope) return;
      if (live) setResult({ request, view, ...(nodes ? { nodes: nodes as Record<string, Node> } : {}) });
    }).catch(error => {
      logRuntimeError('could not read daily Flow', { area: 'persistence', action: 'read_daily_flow_view', error });
      if (live) setResult({ request, error: String(error) });
    });
    return () => { live = false; };
  }, [request]);
  return result?.request === request ? result : null;
}
