import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { buildCanonicalNodeSyncPayload } from '../database/nodeSyncPayload.js';

import { hashText } from './syncNodeResolution.js';

export function topicTextSnapshotHash(snapshot: NativeSyncNodeRecord['snapshot']) {
  return hashText(JSON.stringify(buildCanonicalNodeSyncPayload({
    textAlternatives: snapshot.text_alternatives ?? [],
    anchorLink: snapshot.anchor_link,
    anchorResolutionStatus: snapshot.anchor_resolution_status ?? null,
    anchorSourceVersionId: snapshot.anchor_source_version_id ?? null,
    attachments: snapshot.attachments.map((entry) => ({ attachmentId: entry.attachment_id, role: entry.role })),
    resourceReferences: parseNodeResourceReferences(snapshot.resource_references ?? '[]'),
    content: snapshot.content ?? '', createdAt: snapshot.created_at, deletedAt: snapshot.deleted_at,
    desiredRetention: snapshot.desired_retention, enableShortTerm: snapshot.enable_short_term ?? null,
    sequentialReadingEnabled: snapshot.sequential_reading_enabled ?? null,
    shelvedAt: snapshot.shelved_at ?? null, manualChildOrder: snapshot.manual_child_order ?? null,
    hideTitleHeading: snapshot.hide_title_heading, id: snapshot.id,
    imageRegions: snapshot.image_regions, imageSources: snapshot.image_sources ?? null,
    importContentFingerprint: snapshot.import_content_fingerprint ?? null,
    importSourceFingerprint: snapshot.import_source_fingerprint ?? null,
    isTitleManual: snapshot.is_title_manual, kind: snapshot.kind, openingText: snapshot.opening_text,
    parentId: snapshot.parent_id, priority: snapshot.priority, reveal: snapshot.reveal,
    title: snapshot.title, updatedAt: snapshot.updated_at, virtualFilter: snapshot.virtual_filter
  })));
}
