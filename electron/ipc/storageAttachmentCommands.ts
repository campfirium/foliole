import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { copyAttachmentImageToClipboard, exportAttachmentImage } from '../attachments/attachmentImageActions.js';
import { importClipboardImageAttachment } from '../attachments/importClipboardImageAttachment.js';
import { importLocalImageAttachment } from '../attachments/importLocalImageAttachment.js';
import { importRemoteImageAttachment } from '../attachments/importRemoteImageAttachment.js';
import { resolveAttachmentResource } from '../attachments/resourceResolver.js';

import { asString } from './commandParsers.js';

export function handleStorageAttachmentCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof exportAttachmentImage>[1] = null
) {
  if (command === NATIVE_COMMANDS.importClipboardImageAttachment) {
    return importClipboardImageAttachment({
      bytesBase64: asString(args.bytesBase64, 'bytesBase64'),
      mimeType: asString(args.mimeType, 'mimeType'),
      nodeId: asString(args.nodeId, 'nodeId'),
      originalName: typeof args.originalName === 'string' ? args.originalName : undefined
    });
  }

  if (command === NATIVE_COMMANDS.importLocalImageAttachment) {
    return importLocalImageAttachment(
      asString(args.nodeId, 'nodeId'),
      asString(args.sourcePath, 'sourcePath')
    );
  }

  if (command === NATIVE_COMMANDS.importRemoteImageAttachment) {
    return importRemoteImageAttachment({
      nodeId: asString(args.nodeId, 'nodeId'),
      sourceUrl: asString(args.sourceUrl, 'sourceUrl')
    });
  }

  if (command === NATIVE_COMMANDS.resolveAttachmentResource) {
    return resolveAttachmentResource(asString(args.attachment_id, 'attachment_id'));
  }

  if (command === NATIVE_COMMANDS.copyAttachmentImageToClipboard) {
    return copyAttachmentImageToClipboard(asString(args.attachment_id, 'attachment_id'));
  }

  if (command === NATIVE_COMMANDS.exportAttachmentImage) {
    return exportAttachmentImage(asString(args.attachment_id, 'attachment_id'), window);
  }

  return undefined;
}
