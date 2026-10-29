import { useEffect, useRef } from 'react';

import { hasFlowDayChanged } from '../store/workspaceFlowDay';

import type { CompanionSurfaceActionArgs } from './useCompanionSurfaceActions';

type Token = ReturnType<CompanionSurfaceActionArgs['flow']['capture']>;

export function useCompanionReadAdmission(args: CompanionSurfaceActionArgs,
  latest: { current: CompanionSurfaceActionArgs }, setError: (error: string | null) => void) {
  const refreshFailed = useRef(false);
  useEffect(() => args.flow.readIntents?.subscribe(() => {
    const engine = args.flow.readIntents!;
    setError(engine.error);
    if (!engine.pending) void latest.current.workspaceSync.refreshAfterMutation().catch(error => {
      if (latest.current.flow.readIntents !== engine) return;
      refreshFailed.current = true;
      setError(error instanceof Error ? error.message : String(error));
    });
  }), [args.flow.readIntents]);

  return async (token: Token) => {
    const engine = args.flow.readIntents;
    const now = new Date().toISOString();
    if (!engine || hasFlowDayChanged(token.session, now)) return false;
    if (engine.error) { await engine.retry(); return true; }
    if (refreshFailed.current) {
      await args.workspaceSync.refreshAfterMutation();
      refreshFailed.current = false;
      return true;
    }
    await args.activity.flush(undefined, { position: false });
    if (!latest.current.active || !args.flow.matches(token)) return true;
    token.owner.readEpoch = token.epoch;
    const history = args.flow.historyContext(token)!;
    const accepted = await engine.accept({ session: token.session, now, mode: history.mode, historyKey: history.key });
    args.flow.advance(token, 'read', args.snapshot!, now, accepted.session);
    args.floatingBar.revealBar();
    return true;
  };
}
