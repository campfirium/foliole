import { loadIosMissingAttachments } from './companion/runtime/iosCompanionActiveDatabaseReads';
import { FolioleCompanionSync, isNativeCompanionAttachmentResourceRuntime } from './companionWorkspaceRuntimeRepository';

export async function loadCompanionMissingAttachmentResources(limit = 50) {
  if (!isNativeCompanionAttachmentResourceRuntime()) {
    return [] as Array<{ attachment_id: string; content_hash: string; mime_type: string; size_bytes?: number; storage_key: string }>;
  }
  return loadIosMissingAttachments(limit) as Promise<Array<{
    attachment_id: string; content_hash: string; mime_type: string; size_bytes?: number; storage_key: string
  }>>;
}

export async function loadCompanionMissingAttachmentResource(attachmentId: string) {
  if (!isNativeCompanionAttachmentResourceRuntime()) {
    return null as { attachment_id: string; content_hash: string; mime_type: string; size_bytes?: number; storage_key: string } | null;
  }
  const row = (await loadIosMissingAttachments(1, attachmentId))[0] as {
    attachment_id: string; content_hash: string; mime_type: string; size_bytes?: number; storage_key: string
  } | undefined;
  if (!row) return null;
  // Integrity check on purpose: this request runs after a display failed, and a stored file with bad
  // bytes must still be queued for a pull so the peer copy can replace it.
  const local = await FolioleCompanionSync.resolveAttachmentResource({ attachment_id: row.attachment_id, storage_key: row.storage_key,
    content_hash: row.content_hash, mime_type: row.mime_type });
  return local?.status === 'ready' ? null : row;
}
