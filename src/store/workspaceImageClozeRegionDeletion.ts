import { removeImageClozeRegion } from '../features/image-cloze/model/imageCloze';

import type { DeleteNodeMutationResult } from './workspaceTrashMutations';

export interface ImageRegionDeletion { parentNodeId: string; attachmentId: string; regionId: string }

export function reconcileExplicitImageRegionRemoval(
  mutation: DeleteNodeMutationResult,
  parentNodeId: string,
  attachmentId: string,
  regionId: string
) {
  const parentNode = mutation.patch.nodesById[parentNodeId];
  if (!parentNode) {
    return mutation;
  }
  const nextImageRegions = removeImageClozeRegion(parentNode.imageRegions, attachmentId, regionId);
  if (nextImageRegions === parentNode.imageRegions) {
    return mutation;
  }
  const updatedParentNode = {
    ...parentNode,
    imageRegions: nextImageRegions,
    updatedAt: mutation.deletedAt
  };
  return {
    ...mutation,
    parentNodesToSync: [
      ...mutation.parentNodesToSync.filter((node) => node.id !== parentNodeId),
      updatedParentNode
    ],
    patch: {
      ...mutation.patch,
      nodesById: {
        ...mutation.patch.nodesById,
        [parentNodeId]: updatedParentNode
      }
    }
  };
}
