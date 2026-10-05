export const SYNC_GROUP_MERGE_REQUIRES_OVERWRITE = 'sync_group_merge_requires_overwrite';

export interface SyncGroupJoinMergeProof {
  library_epoch: string;
  proof_revision: number;
  source_proof_revisions: Record<string, number>;
}

export function parseSyncGroupJoinMergeProof(value: unknown): SyncGroupJoinMergeProof {
  const raw = value as Partial<SyncGroupJoinMergeProof> | null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      typeof raw.library_epoch !== 'string' || !raw.library_epoch.trim() ||
      raw.library_epoch !== raw.library_epoch.trim() || raw.library_epoch.includes('\0') ||
      !Number.isSafeInteger(raw.proof_revision) || (raw.proof_revision ?? -1) < 0 ||
      !raw.source_proof_revisions || typeof raw.source_proof_revisions !== 'object' ||
      Array.isArray(raw.source_proof_revisions) ||
      !Object.entries(raw.source_proof_revisions).every(([key, revision]) =>
        key.trim() && key === key.trim() && !key.includes('\0') &&
        Number.isSafeInteger(revision) && revision >= 0)) {
    throw new Error('sync_group_join_merge_proof_invalid');
  }
  return raw as SyncGroupJoinMergeProof;
}
