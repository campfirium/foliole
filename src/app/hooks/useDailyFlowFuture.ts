import { useEffect, useMemo, useState } from 'react';

import type { DailyFlowFutureView } from '../../../lib/core/flow/dailyFlowFuture';
import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { getBrowserDailyFlowRuntime } from '../../shared/platform/runtime/dailyFlowBrowserRuntime';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useDailyFlowFuture(now: string, enabled: boolean, includeEntries: boolean, mode?: ReviewSessionMode) {
  const scope = useWorkspaceStore(state => state.libraryScope);
  const nodes = useWorkspaceStore(state => state.nodesById);
  const order = useWorkspaceStore(state => state.nodeOrder);
  const trashed = useWorkspaceStore(state => state.trashedNodeIds);
  const currentMode = useWorkspaceStore(state => state.reviewSessionMode);
  const settings = getCurrentReviewSchedulerSettings();
  const request = useMemo(() => ({}), [scope, nodes, order, trashed, mode, currentMode, now, enabled, includeEntries, settings]);
  const [result, setResult] = useState<{ request: object; view?: DailyFlowFutureView; error?: string } | null>(null);
  useEffect(() => {
    const runtime = getBrowserDailyFlowRuntime();
    if (!enabled || !now || !runtime) return;
    let live = true;
    void runtime.future({ now, mode: mode ?? currentMode, includeEntries }, nodes).then(view => {
      if (live && (!scope || view.scope === scope)) setResult({ request, view });
    }).catch(error => { if (live) setResult({ request, error: String(error) }); });
    return () => { live = false; };
  }, [request]);
  return result?.request === request ? result : null;
}
