import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';

function serialize(value: unknown) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function canonicalCompanionNodePayload(node: WorkspaceNodeSnapshot) {
  return {
    anchor_link: serialize(node.anchorLink),
    attachments: [],
    content: node.content,
    created_at: node.createdAt,
    deleted_at: node.deletedAt ?? null,
    desired_retention: node.desiredRetention ?? null,
    enable_short_term: node.enableShortTerm ?? null,
    sequential_reading_enabled: node.sequentialReadingEnabled ?? null,
    hide_title_heading: node.hideTitleHeading,
    id: node.id,
    image_regions: serialize(node.imageRegions),
    is_title_manual: node.isTitleManual,
    kind: node.kind,
    opening_text: node.openingText ?? null,
    parent_id: node.parentNodeId,
    position: null,
    priority: node.priority ?? null,
    reveal: node.reveal,
    title: node.title,
    updated_at: node.updatedAt,
    virtual_filter: serialize(node.virtualFilter)
  };
}

export async function sha256Hex(value: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return fallbackHash(value);
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fallbackHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash.toString(16).padStart(8, '0').repeat(8).slice(0, 64);
}

export function toCompanionNativeNodeVersion(
  node: WorkspaceNodeSnapshot,
  deviceId: string,
  contentHash: string
): NativeSyncNodeRecord {
  const snapshot = canonicalCompanionNodePayload(node);
  return {
    ancestor_version_ids: [],
    content_hash: contentHash,
    device_id: deviceId,
    object_id: node.id,
    object_type: 'node',
    parent_version_id: node.currentVersionId ?? null,
    snapshot,
    updated_at: node.updatedAt,
    version_created_at: node.updatedAt,
    version_id: `${deviceId}#${crypto.randomUUID()}`
  };
}
