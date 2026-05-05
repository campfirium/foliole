import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

export async function loadCompanionMissingAttachmentResources(limit = 50) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as Array<{ attachment_id: string; content_hash: string; size_bytes?: number }>;
  }
  return (await FolioleCompanionSync.loadMissingAttachmentResources({ limit })).resources;
}

export async function loadCompanionMissingAttachmentResource(attachmentId: string) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null as { attachment_id: string; content_hash: string; size_bytes?: number } | null;
  }
  return (await FolioleCompanionSync.loadMissingAttachmentResource({ attachment_id: attachmentId })).resource;
}
