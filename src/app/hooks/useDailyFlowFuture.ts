import { useEffect, useMemo, useState } from 'react';

import type { DailyFlowFutureView } from '../../../lib/core/flow/dailyFlowFuture';
import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { getBrowserDailyFlowRuntime } from '../../shared/platform/runtime/dailyFlowBrowserRuntime';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useDailyFlowNodeInput } from './useDailyFlowNodeInput';

export function useDailyFlowFuture(now: string, enabled: boolean, includeEntries: boolean, mode?: ReviewSessionMode) {
  const scope = useWorkspaceStore(state => state.libraryScope);
  const nodes = useWorkspaceStore(state => state.nodesById);
  const order = useWorkspaceStore(state => state.nodeOrder);
  const trashed = useWorkspaceStore(state => state.trashedNodeIds);
  const currentMode = useWorkspaceStore(state => state.reviewSessionMode);
  const settings = getCurrentReviewSchedulerSettings();
  const learningNodes = useDailyFlowNodeInput(nodes);
  const context = useMemo(() => ({}), [scope, mode, currentMode, now, enabled, includeEntries, settings]);
  const orderKey = JSON.stringify(order);
  const trashKey = JSON.stringify(trashed);
  const request = useMemo(() => ({}), [context, learningNodes, orderKey, trashKey]);
  const [result, setResult] = useState<{ request: object; context: object; view?: DailyFlowFutureView; error?: string } | null>(null);
  useEffect(() => {
    const runtime = getBrowserDailyFlowRuntime();
    if (!enabled || !now || !runtime) return;
    let live = true;
    void runtime.future({ now, mode: mode ?? currentMode, includeEntries }, nodes).then(view => {
      if (live && (!scope || view.scope === scope)) setResult({ request, context, view });
    }).catch(error => { if (live) setResult({ request, context, error: String(error) }); });
    return () => { live = false; };
  }, [request]);
  return result?.request === request || (result?.context === context && result.view) ? result : null;
}
