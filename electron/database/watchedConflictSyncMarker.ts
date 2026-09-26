import {
  loadUnreconciledWatchedFolderConflictDecisions,
  markWatchedFolderConflictReconciled
} from './watchedFolderConflictDecisions.js';

export function markWatchedConflictDecisionsSynced(startedAt: string,
  completedAt = new Date().toISOString()) {
  for (const decision of loadUnreconciledWatchedFolderConflictDecisions()) {
    if (decision.decided_at <= startedAt) {
      markWatchedFolderConflictReconciled(decision.conflict_key, completedAt);
    }
  }
}
