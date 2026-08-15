import type { SyncGroupLibraryFacts } from '../../lib/platform/syncGroupContract.js';

export function parseSyncGroupLibraryFacts(value: unknown): SyncGroupLibraryFacts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const countKeys = ['attachment_count', 'content_blob_count', 'node_count', 'review_log_count'] as const;
  if (countKeys.some((key) => !Number.isSafeInteger(raw[key]) || Number(raw[key]) < 0)) return null;
  if (raw.timeline_id !== null && typeof raw.timeline_id !== 'string') return null;
  return {
    attachment_count: Number(raw.attachment_count),
    content_blob_count: Number(raw.content_blob_count),
    node_count: Number(raw.node_count),
    review_log_count: Number(raw.review_log_count),
    timeline_id: typeof raw.timeline_id === 'string' && raw.timeline_id.trim() ? raw.timeline_id.trim() : null
  };
}

export function isEligibleSyncGroupJoin(args: {
  groupId: string;
  libraryFacts: SyncGroupLibraryFacts | null;
  requestedGroupId: string;
}) {
  return args.groupId === args.requestedGroupId
    && args.libraryFacts !== null;
}
