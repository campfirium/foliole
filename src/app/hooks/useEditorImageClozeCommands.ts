import type { ImageClozeDraftRegion } from '../../features/image-cloze/model/imageCloze';

export interface ImageClozeComposerState {
  attachmentId: string;
  parentNodeId: string;
}

interface CreateImageClozeHandlersArgs {
  activeNodeId: string | null;
  closeContextMenu: () => void;
  contextMenuKind: 'image' | 'selection' | null;
  createImageClozeNodes: (
    parentNodeId: string,
    attachmentId: string,
    regions: ImageClozeDraftRegion[]
  ) => string[];
  imageAttachmentId: string | null;
  imageClozeComposer: ImageClozeComposerState | null;
  setImageClozeComposer: (value: ImageClozeComposerState | null) => void;
}

export function createImageClozeHandlers(args: CreateImageClozeHandlersArgs) {
  return {
    handleCloseImageClozeComposer() {
      args.setImageClozeComposer(null);
    },
    handleCreateImageCloze() {
      if (args.contextMenuKind !== 'image' || !args.activeNodeId || !args.imageAttachmentId) {
        return;
      }
      args.setImageClozeComposer({
        attachmentId: args.imageAttachmentId,
        parentNodeId: args.activeNodeId
      });
      args.closeContextMenu();
    },
    handleSaveImageCloze(regions: ImageClozeDraftRegion[]) {
      if (!args.imageClozeComposer) {
        return [];
      }
      const createdNodeIds = args.createImageClozeNodes(
        args.imageClozeComposer.parentNodeId,
        args.imageClozeComposer.attachmentId,
        regions
      );
      args.setImageClozeComposer(null);
      return createdNodeIds;
    }
  };
}
