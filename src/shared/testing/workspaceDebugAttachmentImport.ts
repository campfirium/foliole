import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../platform/bridge';

export function createClipboardImportHandler() {
  return async ({ bytesBase64, mimeType, nodeId, originalName }: {
    bytesBase64: string;
    mimeType: string;
    nodeId: string;
    originalName?: string;
  }) => {
    const runtimeInvoke = getRuntimeInvoke();
    if (!runtimeInvoke) {
      return null;
    }
    const result = await runtimeInvoke(NATIVE_COMMANDS.importClipboardImageAttachment, {
      bytesBase64,
      mimeType,
      nodeId,
      originalName: originalName ?? 'debug-image.png'
    });
    return result && typeof result === 'object' && 'attachment_id' in result && typeof result.attachment_id === 'string'
      ? result.attachment_id
      : null;
  };
}
