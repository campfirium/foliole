import { loadIosMissingAttachments } from './companion/runtime/iosCompanionActiveDatabaseReads';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  FolioleCompanionSync,
  isNativeCompanionAttachmentResourceRuntime
} from './companionWorkspaceRuntimeRepository';

export async function loadCompanionMissingAttachmentResources(limit = 50) {
  if (!isNativeCompanionAttachmentResourceRuntime()) {
    return [] as Array<{ attachment_id: string; content_hash: string; size_bytes?: number }>;
  }
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return loadIosMissingAttachments(limit) as Promise<Array<{ attachment_id: string; content_hash: string; size_bytes?: number }>>;
  }
  return (await FolioleCompanionSync.loadMissingAttachmentResources({ limit })).resources;
}

export async function loadCompanionMissingAttachmentResource(attachmentId: string) {
  if (!isNativeCompanionAttachmentResourceRuntime()) {
    return null as { attachment_id: string; content_hash: string; size_bytes?: number } | null;
  }
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return (await loadIosMissingAttachments(1, attachmentId))[0] as { attachment_id: string; content_hash: string; size_bytes?: number } | undefined ?? null;
  }
  return (await FolioleCompanionSync.loadMissingAttachmentResource({ attachment_id: attachmentId })).resource;
}
