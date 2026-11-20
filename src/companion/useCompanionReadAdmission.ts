import { useEffect } from 'react';

import { timeFlow, type FlowTiming } from '../../lib/core/flow/flowTiming';
import { hasFlowDayChanged } from '../store/workspaceFlowDay';

import type { CompanionSurfaceActionArgs } from './useCompanionSurfaceActions';

type Token = ReturnType<CompanionSurfaceActionArgs['flow']['capture']>;

export function useCompanionReadAdmission(args: CompanionSurfaceActionArgs,
  latest: { current: CompanionSurfaceActionArgs }, setError: (error: string | null) => void) {
  useEffect(() => args.flow.readIntents?.subscribe(() => {
    const engine = args.flow.readIntents!;
    setError(engine.error);
  }), [args.flow.readIntents]);

  return async (token: Token, releaseSequentialReading: boolean, nextTopicId?: string, timing?: FlowTiming) => {
    const engine = args.flow.readIntents;
    const now = new Date().toISOString();
    if (token.session.dive || !engine || hasFlowDayChanged(token.session, now)) return false;
    if (engine.error) { await engine.retry(); return 'skipped' as const; }
    timing?.('day-check', 'skipped');
    await timeFlow(timing, 'flush', () => args.activity.flush(undefined, { position: false }));
    if (!latest.current.active || !args.flow.matches(token)) return 'cancelled' as const;
    token.owner.readEpoch = token.epoch;
    const history = args.flow.historyContext(token)!;
    const accepted = await engine.accept({ session: token.session, now, mode: history.mode, historyKey: history.key, snapshot: args.snapshot!, releaseSequentialReading,
      ...(nextTopicId ? { nextTopicId } : {}) }, timing);
    args.flow.advance(token, 'read', args.snapshot!, now, accepted.session, timing);
    args.floatingBar.revealBar();
    return 'done' as const;
  };
}
