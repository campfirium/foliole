import {
  createNodeAttachmentLink,
  deleteNodeAttachmentLink,
  listNodeAttachments
} from '../database/attachments.js';

export function replaceReadwiseApiEpubImageLinks(nodeId: string, attachmentIds: string[]) {
  const nextIds = new Set(attachmentIds);
  for (const existing of listNodeAttachments(nodeId)) {
    if (existing.role !== 'image' || nextIds.has(existing.attachmentId)) continue;
    deleteNodeAttachmentLink({ attachmentId: existing.attachmentId, nodeId, role: existing.role });
  }
  for (const attachmentId of nextIds) {
    createNodeAttachmentLink({ attachmentId, nodeId, role: 'image' });
  }
}
