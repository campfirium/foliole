import { useEffect } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { sameCycleProgress } from '../../lib/core/flow/cycleFlowState';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { isCompanionReadReceiptSnapshot, openCompanionDailyFlowForDisplay as openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';

import { companionFlowOpenArgs } from './companionDiveFlowControls';
import { isSettledFlowSnapshot, trackCompanionFlowRefresh } from './companionFlowControls';
import type { FlowOwner } from './useCompanionFlowSession';

/**
 * Reopens the daily Flow when the workspace changes outside the session's own last commit.
 * A Dive keeps its cursor through ordinary changes and moves on only when its current card is in Trash.
 */
export function useFlowSnapshotRefresh(args: { snapshot: WorkspaceSnapshot | null; active: boolean },
  current: FlowOwner, owner: { current: FlowOwner }, latest: { current: { active: boolean } },
  mode: ReviewSessionMode, render: () => void) {
  useEffect(() => {
    if (!args.active || current.diveOpening || (current.session.dive && !isCurrentTrashed()) || !current.hydrated || !current.session.daily || current.readIntents?.pending ||
      isCompanionReadReceiptSnapshot(args.snapshot?.nodesById) || isSettledFlowSnapshot(current, args.snapshot?.nodesById)) return;
    const nodes = args.snapshot?.nodesById;
    // An action's own refreshed snapshot can arrive before the action settles; recheck once it has.
    const acting = current.acting?.done;
    trackCompanionFlowRefresh(current, (acting ? acting.then(() => refreshFlow(nodes)) : refreshFlow(nodes))
      .catch(error => { current.error = String(error); render(); }));
  }, [args.snapshot?.nodesById]);
  function isCurrentTrashed() {
    const id = current.session.currentNodeId;
    return Boolean(id && args.snapshot?.trashedNodeIds.includes(id));
  }
  function refreshFlow(nodes: object | undefined) {
    if (owner.current !== current || isSettledFlowSnapshot(current, nodes) || !current.session.daily || (current.session.dive && !isCurrentTrashed())) return Promise.resolve();
    const source = current.session;
    const generation = current.generation;
    const now = new Date().toISOString();
    return openCompanionDailyFlow(source.dive ? companionFlowOpenArgs(source, mode, now) : { now, mode, preserveCurrent: true }).then(saved => {
      // A Dive shares the saved revision, so only the global Flow can skip an unchanged result.
      if (owner.current !== current || !latest.current.active || current.readIntents?.pending || current.generation !== generation || (!source.dive && saved.session.daily?.revision === source.daily?.revision && saved.session.daily?.dayKey === source.daily?.dayKey && saved.session.daily?.scope === source.daily?.scope)) return;
      current.session = { ...saved.session, isAnswerRevealed:
        saved.session.currentNodeId === source.currentNodeId && current.session.isAnswerRevealed };
      if (!sameCycleProgress(saved.session, source)) current.generation += 1;
      render();
    });
  }
}
