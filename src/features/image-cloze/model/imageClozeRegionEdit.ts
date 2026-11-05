import { getImageClozeLocator, type ImageClozeDraftRegion, type ImageClozeNodeSource } from './imageCloze';

export interface ImageClozeRegionEdit { before: ImageClozeDraftRegion; after: ImageClozeDraftRegion }
export function sameImageClozeRect(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
export function patchImageClozeRegion<T extends ImageClozeNodeSource>(node: T, edit: ImageClozeRegionEdit): T {
  const { x, y, width, height } = edit.after;
  const locator = getImageClozeLocator(node.anchorLink);
  const anchorLink = node.anchorLink && locator?.attachmentId === edit.before.attachmentId &&
    (node.anchorLink.id === edit.before.id || (!node.imageRegions?.length && sameImageClozeRect(locator, edit.before)))
    ? { ...node.anchorLink, locator: { ...locator, x, y, width, height } } : node.anchorLink;
  const imageRegions = node.imageRegions?.map(group => group.attachmentId === edit.before.attachmentId
    ? { ...group, regions: group.regions.map(region => region.id === edit.before.id ? { ...region, x, y, width, height } : region) } : group);
  return { ...node, ...(imageRegions ? { imageRegions } : {}), ...(anchorLink ? { anchorLink } : {}) };
}
