import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { parseNodeResourceReferences } from './nodeResourceReferences.js';
import type { NodeSyncHashInput } from './nodeSyncPayload.js';

/** The existing tombstone identity projects these fields independently of body storage. */
export function nodeSyncSnapshotHashMetadata(snapshot: NativeSyncNodeRecord['snapshot']): Omit<NodeSyncHashInput, 'content'> {
  return {
    anchorLink: snapshot.anchor_link, anchorResolutionStatus: snapshot.anchor_resolution_status ?? null,
    anchorSourceVersionId: snapshot.anchor_source_version_id ?? null,
    attachments: snapshot.attachments.map((item) => ({ attachmentId: item.attachment_id, role: item.role })),
    ...(snapshot.resource_references === undefined ? {} : {
      resourceReferences: parseNodeResourceReferences(snapshot.resource_references)
    }),
    createdAt: snapshot.created_at, deletedAt: snapshot.deleted_at,
    desiredRetention: snapshot.desired_retention, enableShortTerm: snapshot.enable_short_term ?? null,
    sequentialReadingEnabled: snapshot.sequential_reading_enabled ?? null, shelvedAt: snapshot.shelved_at ?? null,
    manualChildOrder: snapshot.manual_child_order ?? null, hideTitleHeading: snapshot.hide_title_heading,
    id: snapshot.id, imageRegions: snapshot.image_regions, imageSources: snapshot.image_sources ?? null,
    importContentFingerprint: snapshot.import_content_fingerprint ?? null,
    importSourceFingerprint: snapshot.import_source_fingerprint ?? null,
    isTitleManual: snapshot.is_title_manual, kind: snapshot.kind, openingText: snapshot.opening_text,
    parentId: snapshot.parent_id, priority: snapshot.priority, reveal: snapshot.reveal,
    title: snapshot.title, updatedAt: snapshot.updated_at, virtualFilter: snapshot.virtual_filter
  };
}
