import { getImageClozeLocator, listImageClozePresentationRegions } from '../features/image-cloze/model/imageCloze';
import { findLiveImageClozeChildNodeIds } from '../features/image-cloze/model/imageClozeDeleteTargets';
import { patchImageClozeRegion, sameImageClozeRect, type ImageClozeRegionEdit } from '../features/image-cloze/model/imageClozeRegionEdit';
import { saveWorkspaceNodeContentMutationWithAnchors } from '../shared/platform/workspaceRuntimeNodeMutationsNow';
import { canCreateSelectionAnnotation } from '../shared/selectionAnnotationEligibility';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import { useWorkspaceStore } from './workspaceStore';

export async function saveImageClozeRegionEdit(parentId: string, edit: ImageClozeRegionEdit) {
  const state = useWorkspaceStore.getState();
  const parent = state.nodesById[parentId];
  if (!parent || !canCreateSelectionAnnotation(parent) || state.trashedNodeIds.includes(parent.id)) return false;
  const { attachmentId, id } = edit.before;
  const ids = findLiveImageClozeChildNodeIds(state, parentId, attachmentId, id);
  const children = ids.map(id => state.nodesById[id]!);
  if (!children.length || children.some(node => {
    const region = listImageClozePresentationRegions(node.imageRegions).find(value => value.id === id && value.attachmentId === attachmentId)
      ?? (!node.imageRegions?.length ? getImageClozeLocator(node.anchorLink) : null);
    return !region || !sameImageClozeRect(region, edit.before);
  })) return false;
  if (sameImageClozeRect(edit.before, edit.after)) return true;

  const updatedAt = new Date(Math.max(Date.now(), ...[parent, ...children].map(node => Date.parse(node.updatedAt) + 1))).toISOString();
  const result = await saveWorkspaceNodeContentMutationWithAnchors({
    parentNode: { ...patchImageClozeRegion(parent, edit), updatedAt },
    affectedAnchorNodes: children.map(node => ({ ...patchImageClozeRegion(node, edit), updatedAt })),
    nodeOrder: state.nodeOrder,
    expectedNodeTimestamps: [parent, ...children].map(node => ({
      nodeId: node.id,
      updatedAt: node.updatedAt
    }))
  });
  if (!result) return false;
  useWorkspaceStore.setState(current => {
    if (current.libraryScope !== state.libraryScope) return current;
    const patch = createWorkspaceNodeMutationPatch(current, result);
    for (const id of [parentId, ...ids]) {
      const node = patch.nodesById?.[id];
      if (node) syncWorkspaceNodeDocumentCacheFromNode(node);
    }
    return patch;
  });
  return true;
}
