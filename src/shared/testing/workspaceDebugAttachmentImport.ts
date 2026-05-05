import { importClipboardImageAttachmentBytes } from '../platform/attachmentImports';

export function createClipboardImportHandler() {
  return async ({ bytesBase64, mimeType, nodeId, originalName }: {
    bytesBase64: string;
    mimeType: string;
    nodeId: string;
    originalName?: string;
  }) => {
    const result = await importClipboardImageAttachmentBytes({
      bytesBase64,
      mimeType,
      nodeId,
      originalName: originalName ?? 'debug-image.png'
    });
    return result?.status === 'imported' ? result.attachment_id : null;
  };
}
