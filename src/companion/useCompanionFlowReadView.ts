import { useEffect, useState } from 'react';

import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import type { DailyFlowView } from '../../lib/core/flow/dailyFlowViewContract';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { readCompanionDailyFlowView } from '../shared/platform/companion/runtime/companionDailyFlow';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

export function useCompanionFlowReadView(active: boolean, ready: boolean, session: DailyFlowSession,
  mode: ReviewSessionMode, libraryScope: string) {
  const [result, setResult] = useState<{ session: DailyFlowSession; libraryScope: string; view?: DailyFlowView; error?: string } | null>(null);
  useEffect(() => {
    if (!active || !ready || !session.daily || session.currentNodeId || !session.continueNodeId || !isAvailableNativeCompanionRuntime()) return;
    const scope = getCompanionReadingScope();
    let live = true;
    void readCompanionDailyFlowView({ now: new Date().toISOString(), mode, includeEntries: false,
      continueNodeId: session.continueNodeId ?? null }).then(view => {
      if (!live || scope !== getCompanionReadingScope()) return;
      if (view.status !== 'ready') { setResult({ session, libraryScope, error: 'Flow needs to be refreshed.' }); return; }
      if (view.scope === session.daily!.scope && view.dayKey === session.daily!.dayKey) setResult({ session, libraryScope, view });
    }).catch(error => { if (live) setResult({ session, libraryScope, error: String(error) }); });
    return () => { live = false; };
  }, [active, ready, session, mode, libraryScope]);
  if (!active || !ready || result?.session !== session || result.libraryScope !== libraryScope) return null;
  return result.view?.mode === mode || result.error ? result : null;
}
