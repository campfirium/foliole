export interface SyncParticipationState {
  lifecycle_active: boolean;
  sync_enabled: boolean;
  sync_paused: boolean;
}

export interface SyncParticipationSnapshot extends SyncParticipationState {
  participating: boolean;
}

export function isSyncParticipationActive(state: SyncParticipationState) {
  return state.sync_enabled && !state.sync_paused && state.lifecycle_active;
}

export function createSyncParticipationSnapshot(
  state: SyncParticipationState
): SyncParticipationSnapshot {
  return {
    ...state,
    participating: isSyncParticipationActive(state)
  };
}
