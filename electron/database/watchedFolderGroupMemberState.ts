import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';

import {
  applyRemoteWatchedFolderConflictDecisions,
  loadWatchedFolderConflictDecisions
} from './watchedFolderConflictDecisions.js';
import {
  applyRemoteWatchedFolderGroupSources,
  loadWatchedFolderGroupSources
} from './watchedFolderGroupSources.js';

export function loadWatchedFolderGroupMemberState() {
  return {
    watched_sources: loadWatchedFolderGroupSources(true),
    watched_decisions: loadWatchedFolderConflictDecisions()
  };
}

export function applyWatchedFolderGroupMemberState(
  incoming: SyncGroupMemberStatePayload,
  authenticatedDeviceId: string
) {
  if (incoming.watched_sources) applyRemoteWatchedFolderGroupSources(
    incoming.watched_sources, authenticatedDeviceId
  );
  if (incoming.watched_decisions) applyRemoteWatchedFolderConflictDecisions(incoming.watched_decisions);
}
