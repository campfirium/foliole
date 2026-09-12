import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import {
  type AttachmentResourceDescription,
  isCanonicalAttachmentStorageKey
} from '../../../lib/platform/attachmentResource';
import { registerAttachmentResourceDescriptions } from '../../../lib/platform/attachmentResourceRegistry';

const AVAILABILITIES = new Set(['cached', 'local', 'missing', 'remote_known', 'unresolved']);

function isAttachmentResourceDescription(
  value: NonNullable<WorkspaceSnapshot['nodesById'][string]['attachments']>[number]
): value is typeof value & AttachmentResourceDescription {
  return Boolean(
    typeof value.availability === 'string' && AVAILABILITIES.has(value.availability) &&
    typeof value.contentHash === 'string' &&
    typeof value.libraryScope === 'string' && value.libraryScope.length > 0 &&
    typeof value.mimeType === 'string' &&
    typeof value.storageKey === 'string' &&
    isCanonicalAttachmentStorageKey(value.storageKey, value.contentHash, value.mimeType)
  );
}

export function registerWorkspaceAttachmentResources(snapshot: WorkspaceSnapshot | null) {
  if (!snapshot) return;
  const descriptions = Object.values(snapshot.nodesById)
    .flatMap((node) => node.attachments ?? [])
    .filter(isAttachmentResourceDescription);
  registerAttachmentResourceDescriptions(descriptions);
}
