import { createHash } from 'node:crypto';

import { normalizeNodeImportProvenance } from './nodeImportProvenance.js';

export interface NodeSyncAttachmentRef {
  attachmentId: string;
  role: string;
}

export interface NodeSyncHashInput {
  anchorLink: string | null;
  anchorResolutionStatus?: 'resolved' | 'unmapped_ambiguous' | 'unmapped_missing' | null;
  anchorSourceVersionId?: string | null;
  attachments: NodeSyncAttachmentRef[];
  content: string;
  createdAt: string;
  deletedAt: string | null;
  desiredRetention: number | null;
  enableShortTerm: boolean | null;
  sequentialReadingEnabled: boolean | null;
  shelvedAt: string | null;
  manualChildOrder: string | null;
  hideTitleHeading: boolean;
  id: string;
  imageRegions: string | null;
  importContentFingerprint: string | null;
  importSourceFingerprint: string | null;
  isTitleManual: boolean;
  kind: string;
  openingText: string | null;
  parentId: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  title: string;
  updatedAt: string;
  virtualFilter: string | null;
}

function normalizeIso<T extends string | null>(value: T): T {
  return value;
}

function normalizeNullableText<T extends string | null>(value: T): T {
  return (value ?? null) as T;
}

function normalizeAttachments(attachments: NodeSyncAttachmentRef[]) {
  return [...attachments]
    .map((attachment) => ({
      attachment_id: attachment.attachmentId,
      role: attachment.role
    }))
    .sort((left, right) =>
      left.attachment_id === right.attachment_id
        ? left.role.localeCompare(right.role)
        : left.attachment_id.localeCompare(right.attachment_id)
    );
}

export function buildCanonicalNodeSyncPayload(input: NodeSyncHashInput) {
  const provenance = normalizeNodeImportProvenance(input);
  return {
    anchor_link: normalizeNullableText(input.anchorLink),
    anchor_resolution_status: normalizeNullableText(input.anchorResolutionStatus ?? null),
    anchor_source_version_id: normalizeNullableText(input.anchorSourceVersionId ?? null),
    attachments: normalizeAttachments(input.attachments),
    content: input.content,
    created_at: normalizeIso(input.createdAt),
    deleted_at: normalizeIso(input.deletedAt),
    desired_retention: input.desiredRetention ?? null,
    enable_short_term: input.enableShortTerm ?? null,
    sequential_reading_enabled: input.sequentialReadingEnabled ?? null,
    shelved_at: normalizeNullableText(input.shelvedAt),
    manual_child_order: normalizeNullableText(input.manualChildOrder),
    hide_title_heading: input.hideTitleHeading,
    id: input.id,
    image_regions: normalizeNullableText(input.imageRegions),
    import_content_fingerprint: provenance.importContentFingerprint,
    import_source_fingerprint: provenance.importSourceFingerprint,
    is_title_manual: input.isTitleManual,
    kind: input.kind,
    opening_text: normalizeNullableText(input.openingText),
    parent_id: normalizeNullableText(input.parentId),
    position: input.position ?? null,
    priority: input.priority ?? null,
    reveal: normalizeNullableText(input.reveal),
    title: input.title,
    updated_at: normalizeIso(input.updatedAt),
    virtual_filter: normalizeNullableText(input.virtualFilter)
  };
}

export function computeNodeSyncHash(input: NodeSyncHashInput) {
  return createHash('sha256').update(JSON.stringify(buildCanonicalNodeSyncPayload(input))).digest('hex');
}
