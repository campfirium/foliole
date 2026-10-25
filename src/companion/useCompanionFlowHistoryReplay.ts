import { useRef, type MutableRefObject } from 'react';

import { getStoredAppLocale } from '../shared/localization/appLanguage';
import { translate } from '../shared/localization/translations';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import type { HistoryMode } from '../store/workspaceReviewHistoryTarget';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import type { CompanionSurfaceActionArgs } from './useCompanionSurfaceActions';

export function useCompanionFlowHistoryReplay(args: CompanionSurfaceActionArgs,
  locked: MutableRefObject<boolean>, hasPendingAction: () => boolean,
  setBusy: (busy: boolean) => void, setError: (error: string | null) => void) {
  const pending = useRef<{ token: ReturnType<typeof args.flow.capture>; session: ReviewSessionState } | null>(null);
  const latest = useRef(args);
  latest.current = args;
  async function replay(mode: HistoryMode) {
    if (locked.current || !latest.current.active || args.activity.editing || hasPendingAction()) return;
    const token = pending.current?.token ?? args.flow.capture();
    const history = args.flow.historyContext(token);
    if (!history) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!pending.current) {
        await args.activity.flush();
        if (!latest.current.active || !args.flow.matches(token)) return;
        const restored = await replayCompanionFlowHistory(history.key, mode, token.session);
        if (!restored) return;
        pending.current = { token, session: restored };
      }
      if (latest.current.active) args.flow.restore(token, pending.current.session);
      if (!await args.workspaceSync.refreshAfterMutation()) throw new Error('Flow refresh failed.');
      pending.current = null;
    } catch { setError(translate(getStoredAppLocale(), 'companion.reading.historyError')); }
    finally { locked.current = false; setBusy(false); }
  }
  return { replay, refreshPending: pending.current !== null };
}
