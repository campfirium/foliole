import { useEffect } from 'react';

import { restoreFlowHistoryEntry } from '../../lib/core/flow/flowHistoryEntry';
import { loadCompanionDailySession } from '../shared/platform/companion/runtime/companionDailyFlow';
import { openCompanionDailyFlowForDisplay as openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { loadCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import { getCompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { getWorkspaceHistoryTopEntry } from '../store/workspaceActionHistoryState';
import { cloneWorkspaceReviewSession } from '../store/workspaceHistoryContext';
import { resolveWorkspaceReviewHistoryTarget } from '../store/workspaceReviewHistoryTarget';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import type { FlowOwner, useCompanionFlowSession } from './useCompanionFlowSession';

export function useFlowHydration(
  args: Parameters<typeof useCompanionFlowSession>[0],
  current: FlowOwner,
  owner: { current: FlowOwner },
  latest: { current: Parameters<typeof useCompanionFlowSession>[0] },
  identity: string, scope: object, mode: 'review-first' | 'recommended', render: () => void
) {
  useEffect(() => {
    if (!args.ready || !args.snapshot || !args.active || current.hydrated) return;
    let cancelled = false;
    if (!isAvailableNativeCompanionRuntime()) { current.error = 'Flow storage is unavailable.'; render(); return; }
    void getCompanionReadIntents().then(async engine => {
      current.readIntents = engine;
      await engine.drain().catch(error => { current.error = String(error); });
      return Promise.all([loadCompanionFlowResume(args.libraryScope, args.onlyReview),
        loadCompanionFlowHistory(companionFlowHistoryKey(args.libraryScope)),
        loadCompanionDailySession()
      ]);
    }).then(async ([preferred, history, daily]) => {
      if (cancelled || owner.current !== current || !latest.current.snapshot) return;
      current.session = daily ?? history?.resumeSession ?? createEmptyReviewSession();
      const top = history && (getWorkspaceHistoryTopEntry(history, 'undo') ?? getWorkspaceHistoryTopEntry(history, 'redo'));
      let entry = top;
      if (top) {
        try { entry = restoreFlowHistoryEntry(top, daily ?? history?.resumeSession ?? current.session); }
        catch { entry = null; }
      }
      if (!daily && entry?.type === 'nodes.change') {
        const saved = history!.undoStack.length ? entry.afterSession : entry.beforeSession;
        if (saved?.currentNodeId === preferred) current.session = cloneWorkspaceReviewSession(saved);
      }
      if (!daily && entry && (entry.type === 'review.grade' || entry.type === 'topic.dismiss')) {
        const replayMode = history!.undoStack.length ? 'undo' : 'redo';
        const context = replayMode === 'undo' ? entry.afterContext : entry.beforeContext;
        if (context.reviewSession.currentNodeId === preferred &&
          resolveWorkspaceReviewHistoryTarget({ ...latest.current.snapshot, entry, mode: replayMode,
          reviewSession: context.reviewSession })) current.session = cloneWorkspaceReviewSession(context.reviewSession);
      }
      {
        const saved = await openCompanionDailyFlow({ now: new Date().toISOString(), mode,
          ...(!daily && current.session.sessionStartedAt ? { seed: current.session } : {}), preferredNodeId: preferred });
        if (cancelled || owner.current !== current || !latest.current.active) return;
        current.session = saved.session;
      }
      current.hydrated = true;
      render();
    }).catch((error: unknown) => {
      if (cancelled) return;
      current.error = error instanceof Error ? error.message : 'Could not restore Flow.';
      current.session = createEmptyReviewSession();
      current.hydrated = false;
      render();
    });
    return () => { cancelled = true; };
  }, [identity, scope, args.ready, args.active, Boolean(args.snapshot)]);
}
