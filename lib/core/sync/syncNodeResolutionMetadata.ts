import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { FramedSyncNodeMetadata } from './framedSyncNodeRestore.js';

export function nextResolutionTimestamp(records: readonly Pick<NativeSyncNodeRecord, 'version_created_at'>[]) {
  const parentTimestamps = records.map((record) => Date.parse(record.version_created_at ?? ''));
  if (parentTimestamps.some((timestamp) => !Number.isFinite(timestamp))) {
    throw new Error('sync_resolution_timestamp_invalid');
  }
  return new Date(Math.max(...parentTimestamps) + 1).toISOString();
}

export function canonicalResolutionJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    )));
  });
}

export function normalizeResolutionMetadataSnapshot(
  snapshot: FramedSyncNodeMetadata['snapshot'], updatedAt: string
): FramedSyncNodeMetadata['snapshot'] {
  return {
    ...snapshot,
    anchor_resolution_status: snapshot.anchor_resolution_status ?? null,
    anchor_source_version_id: snapshot.anchor_source_version_id ?? null,
    attachments: [...snapshot.attachments].sort((left, right) => {
      const a = `${left.attachment_id}\n${left.role}`;
      const b = `${right.attachment_id}\n${right.role}`;
      return a < b ? -1 : a > b ? 1 : 0;
    }),
    body_blob_hash: null,
    enable_short_term: snapshot.enable_short_term ?? null,
    image_sources: snapshot.image_sources ?? null,
    import_content_fingerprint: snapshot.import_content_fingerprint ?? null,
    import_source_fingerprint: snapshot.import_source_fingerprint ?? null,
    manual_child_order: snapshot.manual_child_order ?? null,
    sequential_reading_enabled: snapshot.sequential_reading_enabled ?? null,
    shelved_at: snapshot.shelved_at ?? null,
    updated_at: updatedAt
  };
}
