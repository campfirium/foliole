export type SyncGroupJoinMode = 'merge' | 'overwrite';

export function parseSyncGroupJoinMode(value: unknown): SyncGroupJoinMode {
  if (value !== 'merge' && value !== 'overwrite') throw new Error('sync_group_join_mode_required');
  return value;
}
