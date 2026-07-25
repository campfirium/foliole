import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { buildCanonicalNodeSyncPayload } from './nodeSyncHash.js';
import type { WorkspaceNodeSnapshot } from './workspaceSnapshotHelpers.js';

function serialize(value: unknown) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function canonicalWorkspaceNodePayload(node: WorkspaceNodeSnapshot) {
  return buildCanonicalNodeSyncPayload({
    anchorLink: serialize(node.anchorLink),
    attachments: (node.attachments ?? []).map((attachment) => ({
      attachmentId: attachment.attachmentId,
      role: attachment.role
    })),
    content: node.content,
    createdAt: node.createdAt,
    deletedAt: node.deletedAt ?? null,
    desiredRetention: node.desiredRetention ?? null,
    enableShortTerm: node.enableShortTerm ?? null,
    sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
    shelvedAt: node.shelvedAt ?? null,
    manualChildOrder: node.kind === 'folder' ? serialize(node.manualChildOrder) : null,
    hideTitleHeading: node.hideTitleHeading,
    id: node.id,
    imageRegions: serialize(node.imageRegions),
    importContentFingerprint: node.importContentFingerprint ?? null,
    importSourceFingerprint: node.importSourceFingerprint ?? null,
    isTitleManual: node.isTitleManual,
    kind: node.kind,
    openingText: node.openingText ?? null,
    parentId: node.parentNodeId,
    position: node.position ?? null,
    priority: node.priority ?? null,
    reveal: node.reveal,
    title: node.title,
    updatedAt: node.updatedAt,
    virtualFilter: serialize(node.virtualFilter)
  });
}

async function sha256Hex(value: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('sync_node_version_hash_unavailable');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function toWorkspaceNativeNodeVersion(
  node: WorkspaceNodeSnapshot,
  deviceId: string
): Promise<NativeSyncNodeRecord> {
  const snapshot = canonicalWorkspaceNodePayload(node);
  const contentHash = await sha256Hex(JSON.stringify(snapshot));
  return {
    ancestor_version_ids: [],
    body_text: node.content,
    content_hash: contentHash,
    device_id: deviceId,
    object_id: node.id,
    object_type: 'node',
    parent_version_id: node.currentVersionId ?? null,
    parent_version_ids: node.currentVersionId ? [node.currentVersionId] : [],
    snapshot,
    updated_at: node.updatedAt,
    version_created_at: node.updatedAt,
    version_id: `${deviceId}#${crypto.randomUUID()}`
  };
}
