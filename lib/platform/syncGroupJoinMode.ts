export type SyncGroupJoinMode = 'overwrite' | 'use-group';

export function parseSyncGroupJoinMode(value: unknown): SyncGroupJoinMode {
  if (value !== 'overwrite' && value !== 'use-group') throw new Error('sync_group_join_mode_required');
  return value;
}
