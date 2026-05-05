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
      attachmentId: attachment.attachmentId,
      role: attachment.role
    }))
    .sort((left, right) =>
      left.attachmentId === right.attachmentId
        ? left.role.localeCompare(right.role)
        : left.attachmentId.localeCompare(right.attachmentId)
    );
}

export function buildCanonicalNodeSyncPayload(input: NodeSyncHashInput) {
  return {
    anchorLink: normalizeNullableText(input.anchorLink),
    attachments: normalizeAttachments(input.attachments),
    content: input.content,
    createdAt: normalizeIso(input.createdAt),
    deletedAt: normalizeIso(input.deletedAt),
    desiredRetention: input.desiredRetention ?? null,
    hideTitleHeading: input.hideTitleHeading,
    id: input.id,
    imageRegions: normalizeNullableText(input.imageRegions),
    isTitleManual: input.isTitleManual,
    kind: input.kind,
    openingText: normalizeNullableText(input.openingText),
    parentId: normalizeNullableText(input.parentId),
    position: input.position ?? null,
    priority: input.priority ?? null,
    reveal: normalizeNullableText(input.reveal),
    title: input.title,
    updatedAt: normalizeIso(input.updatedAt),
    virtualFilter: normalizeNullableText(input.virtualFilter)
  };
}

export function computeNodeSyncHash(input: NodeSyncHashInput) {
  return createHash('sha256').update(JSON.stringify(buildCanonicalNodeSyncPayload(input))).digest('hex');
}
