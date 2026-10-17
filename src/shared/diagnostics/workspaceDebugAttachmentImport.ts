import { useWorkspaceStore } from '../../store/workspaceStore';
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
    if (result?.status !== 'imported') return null;
    useWorkspaceStore.setState(state => {
      const node = state.nodesById[nodeId];
      if (!node) return state;
      const reference = { storage_key: result.storage_key, original_name: result.original_name, role: 'image' as const };
      const references = node.pendingImageReferences ?? [];
      return { nodesById: { ...state.nodesById, [nodeId]: { ...node,
        pendingImageReferences: references.some(existing => existing.storage_key === reference.storage_key)
          ? references : [...references, reference]
      } } };
    });
    return result.attachment_id;
  };
}
