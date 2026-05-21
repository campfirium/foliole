import {
  appendImageClozeRegions,
  type ImageClozeDraftRegion,
  type ImageClozeSourcePayload
} from '../features/image-cloze/model/imageCloze';

import type { WorkspaceState } from './workspaceStore';

type WorkspaceNode = WorkspaceState['nodesById'][string];

export function normalizeImageClozeRegions(attachmentId: string, regions: ImageClozeDraftRegion[]) {
  return regions
    .map((region) => ({
      ...region,
      answer: region.answer.trim()
    }))
    .filter(
      (region) =>
        attachmentId.length > 0 &&
        region.width > 0 &&
        region.height > 0
    );
}

export function normalizeImageClozeSourcePayload(sourcePayload: ImageClozeSourcePayload) {
  return {
    promptContent: sourcePayload.promptContent.trim(),
    revealContent: sourcePayload.revealContent.trim()
  };
}

export function updateParentNodeImageRegions(
  parentNode: WorkspaceNode,
  attachmentId: string,
  regions: ImageClozeDraftRegion[],
  timestamp: string
) {
  return {
    ...parentNode,
    imageRegions: appendImageClozeRegions(parentNode.imageRegions, attachmentId, regions),
    updatedAt: timestamp
  };
}
