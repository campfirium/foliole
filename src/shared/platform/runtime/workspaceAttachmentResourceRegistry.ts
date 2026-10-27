import {
  type AttachmentResourceDescription,
  isCanonicalAttachmentStorageKey
} from '../../../../lib/platform/attachmentResource.js';
import { registerAttachmentResourceDescriptions } from '../../../../lib/platform/attachmentResourceRegistry.js';

const AVAILABILITIES = new Set(['cached', 'local', 'missing', 'remote_known', 'unresolved']);

interface WorkspaceAttachmentSnapshot {
  nodesById: Record<string, { attachments?: readonly unknown[] }>;
}

const catalogDescriptions = new WeakMap<WorkspaceAttachmentSnapshot['nodesById'], AttachmentResourceDescription[]>();

function isAttachmentResourceDescription(value: unknown): value is AttachmentResourceDescription {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return Boolean(
    typeof candidate.attachmentId === 'string' &&
    typeof candidate.availability === 'string' && AVAILABILITIES.has(candidate.availability) &&
    typeof candidate.contentHash === 'string' &&
    typeof candidate.libraryScope === 'string' && candidate.libraryScope.length > 0 &&
    typeof candidate.mimeType === 'string' &&
    typeof candidate.storageKey === 'string' &&
    isCanonicalAttachmentStorageKey(candidate.storageKey, candidate.contentHash, candidate.mimeType)
  );
}

export function registerWorkspaceAttachmentResources(snapshot: WorkspaceAttachmentSnapshot | null) {
  if (!snapshot) return;
  let descriptions = catalogDescriptions.get(snapshot.nodesById);
  if (!descriptions) {
    descriptions = Object.values(snapshot.nodesById)
      .flatMap((node) => node.attachments ?? [])
      .filter(isAttachmentResourceDescription);
    catalogDescriptions.set(snapshot.nodesById, descriptions);
  }
  // Registration still runs after a registry reset or another library's publication.
  registerAttachmentResourceDescriptions(descriptions);
}
