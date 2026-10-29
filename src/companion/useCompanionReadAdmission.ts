import { useEffect } from 'react';

import { hasFlowDayChanged } from '../store/workspaceFlowDay';

import type { CompanionSurfaceActionArgs } from './useCompanionSurfaceActions';

type Token = ReturnType<CompanionSurfaceActionArgs['flow']['capture']>;

export function useCompanionReadAdmission(args: CompanionSurfaceActionArgs,
  latest: { current: CompanionSurfaceActionArgs }, setError: (error: string | null) => void) {
  useEffect(() => args.flow.readIntents?.subscribe(() => {
    const engine = args.flow.readIntents!;
    setError(engine.error);
  }), [args.flow.readIntents]);

  return async (token: Token) => {
    const engine = args.flow.readIntents;
    const now = new Date().toISOString();
    if (!engine || hasFlowDayChanged(token.session, now)) return false;
    if (engine.error) { await engine.retry(); return true; }
    await args.activity.flush(undefined, { position: false });
    if (!latest.current.active || !args.flow.matches(token)) return true;
    token.owner.readEpoch = token.epoch;
    const history = args.flow.historyContext(token)!;
    const accepted = await engine.accept({ session: token.session, now, mode: history.mode, historyKey: history.key, snapshot: args.snapshot! });
    args.flow.advance(token, 'read', args.snapshot!, now, accepted.session);
    args.floatingBar.revealBar();
    return true;
  };
}
