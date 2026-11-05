import { isImageClozeLocator, type ImageClozeNodeSource } from './imageCloze';

type RegionWorkspace = { nodesById: Record<string, ImageClozeNodeSource>; trashedNodeIds: readonly string[] };

function findImageClozeRegionShape(
  state: RegionWorkspace,
  parentNodeId: string,
  attachmentId: string,
  regionId: string
) {
  const parentNode = state.nodesById[parentNodeId];
  const group = parentNode?.imageRegions?.find((entry) => entry.attachmentId === attachmentId);
  return group?.regions.find((region) => region.id === regionId) ?? null;
}

function matchesImageClozeRegionShape(
  locator: { attachmentId: string; x: number; y: number; width: number; height: number },
  region: { x: number; y: number; width: number; height: number } | null
) {
  return Boolean(
    region &&
      locator.x === region.x &&
      locator.y === region.y &&
      locator.width === region.width &&
      locator.height === region.height
  );
}

export function findLiveImageClozeChildNodeIds(
  state: RegionWorkspace,
  parentNodeId: string,
  attachmentId: string,
  regionId: string
) {
  const regionShape = findImageClozeRegionShape(state, parentNodeId, attachmentId, regionId);
  return Object.values(state.nodesById)
    .filter((node) => {
      if (node.parentNodeId !== parentNodeId || state.trashedNodeIds.includes(node.id)) {
        return false;
      }
      if (node.imageRegions?.some((group) => group.attachmentId === attachmentId && group.regions.some((region) => region.id === regionId))) {
        return true;
      }
      if (node.anchorLink?.kind !== 'cloze') {
        return false;
      }
      if (!isImageClozeLocator(node.anchorLink.locator) || node.anchorLink.locator.attachmentId !== attachmentId) {
        return false;
      }
      return node.anchorLink.id === regionId || (!node.imageRegions?.some(group => group.regions.length > 0) && matchesImageClozeRegionShape(node.anchorLink.locator, regionShape));
    })
    .map((node) => node.id);
}
