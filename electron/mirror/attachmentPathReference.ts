import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { findAttachmentRecordById } from '../database/attachments.js';

export function resolveMirrorAttachmentPath(attachmentId: string) {
  const normalizedAttachmentId = attachmentId.trim();
  if (!normalizedAttachmentId) {
    return null;
  }

  const attachment = findAttachmentRecordById(normalizedAttachmentId);
  if (!attachment) {
    return null;
  }

  return resolveAttachmentStoragePath(attachment.id, undefined, attachment.originalName);
}
