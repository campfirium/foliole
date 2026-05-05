import { createHash } from 'node:crypto';

export interface NodeSyncAttachmentRef {
  attachmentId: string;
  role: string;
}

export interface NodeSyncHashInput {
  anchorLink: string | null;
  attachments: NodeSyncAttachmentRef[];
  content: string;
  createdAt: string;
  deletedAt: string | null;
  desiredRetention: number | null;
  hideTitleHeading: boolean;
  id: string;
  imageRegions: string | null;
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

function normalizeIso(value: string | null) {
  return value ?? null;
}

function normalizeNullableText(value: string | null) {
  return value ?? null;
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
  return {
    anchor_link: normalizeNullableText(input.anchorLink),
    attachments: normalizeAttachments(input.attachments),
    content: input.content,
    created_at: normalizeIso(input.createdAt),
    deleted_at: normalizeIso(input.deletedAt),
    desired_retention: input.desiredRetention ?? null,
    hide_title_heading: input.hideTitleHeading,
    id: input.id,
    image_regions: normalizeNullableText(input.imageRegions),
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
