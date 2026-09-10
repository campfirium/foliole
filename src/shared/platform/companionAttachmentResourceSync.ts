import { loadIosMissingAttachments } from './companion/runtime/iosCompanionActiveDatabaseReads';
import { isNativeCompanionAttachmentResourceRuntime } from './companionWorkspaceRuntimeRepository';

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
  return (await loadIosMissingAttachments(1, attachmentId))[0] as {
    attachment_id: string; content_hash: string; mime_type: string; size_bytes?: number; storage_key: string
  } | undefined ?? null;
}
