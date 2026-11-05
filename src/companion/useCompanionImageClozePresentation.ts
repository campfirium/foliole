import { useLayoutEffect } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { deriveImageClozeRegionsFromChildren, getImageClozeLocator, listImageClozePresentationRegions, mergeImageClozeRegionGroups } from '../features/image-cloze/model/imageCloze';
import { registerImageClozeEditorPresentation, unregisterImageClozeEditorPresentation, type ImageClozeEditorPresentation } from '../features/image-cloze/model/imageClozePresentation';

export function useCompanionImageClozePresentation(snapshot: WorkspaceSnapshot | null, nodeId: string) {
  useLayoutEffect(() => {
    const node = snapshot?.nodesById[nodeId];
    if (!node || !snapshot) return;
    const locator = getImageClozeLocator(node.anchorLink);
    const regions = locator
      ? listImageClozePresentationRegions(node.imageRegions).filter(region => region.attachmentId === locator.attachmentId)
      : listImageClozePresentationRegions(mergeImageClozeRegionGroups(node.imageRegions,
        deriveImageClozeRegionsFromChildren({ nodeId, nodesById: snapshot.nodesById, trashedNodeIds: snapshot.trashedNodeIds })));
    const current = locator && !regions.length ? [{ ...locator, id: node.anchorLink!.id }] : regions;
    const ids = current.map(region => region.id);
    const base: ImageClozeEditorPresentation = { canCreate: false, regions: current, outlinedRegionIds: locator ? [] : ids, hiddenRegionIds: locator ? ids : [] };
    registerImageClozeEditorPresentation(nodeId, base);
    registerImageClozeEditorPresentation(nodeId + '::answer', { ...base, outlinedRegionIds: ids, hiddenRegionIds: [] });
    return () => {
      unregisterImageClozeEditorPresentation(nodeId);
      unregisterImageClozeEditorPresentation(nodeId + '::answer');
    };
  }, [nodeId, snapshot]);
}
