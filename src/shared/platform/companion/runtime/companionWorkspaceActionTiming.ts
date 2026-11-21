import { companionWorkspaceReadTotals } from '../companionWorkspaceSnapshotRefresh';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';
import { traceCompanionSyncEvent } from '../sync/diagnostics/companionDesktopSyncTrace';

import { countWholeLibraryWork } from './companionWholeLibraryWork';

type Stage = 'flush' | 'task' | 'refresh';
type Fields = Record<string, number | boolean>;

/**
 * Splits one workspace action, from tap to the frame after its refreshed list, into the parts a slow case can hide in.
 * The refresh fields tell whether it joined a refresh already reading, how many reads it waited for, how long those
 * reads queued for the database and the snapshot connection, and how many of them reread the whole library.
 */
export function startCompanionWorkspaceActionTiming(now = () => performance.now(),
  nextFrame: (done: () => void) => void = scheduleNextFrame) {
  const startedAt = now();
  const fields: Fields = {};
  return {
    /** Starts a stage and returns its end. */
    stage(stage: Stage) {
      const at = now();
      const joined = stage === 'refresh' && companionWorkspaceSnapshots.refreshing;
      const before = companionWorkspaceReadTotals();
      return () => {
        const endedAt = now();
        fields[`${stage}Ms`] = Math.round(endedAt - at);
        if (stage !== 'refresh') return;
        const after = companionWorkspaceReadTotals();
        Object.assign(fields, { refreshJoined: joined, refreshReads: after.reads - before.reads,
          refreshQueueMs: Math.round(after.queueMs - before.queueMs), refreshReadMs: Math.round(after.readMs - before.readMs),
          refreshFullReads: countWholeLibraryWork('full-refresh', at, endedAt) });
      };
    },
    finish(status: 'completed' | 'failed') {
      const settledAt = now();
      const settled = { ...fields, totalMs: Math.round(settledAt - startedAt) };
      nextFrame(() => traceCompanionSyncEvent('workspace_action', status, { ...settled, paintMs: Math.round(now() - settledAt) }));
    }
  };
}

function scheduleNextFrame(done: () => void) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => done());
  else setTimeout(done, 0);
}
