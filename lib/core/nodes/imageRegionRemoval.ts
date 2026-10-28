import type { StoredImageRegionGroup } from '../database/imageRegionCodec.js';

export interface ImageRegionLocator {
  attachmentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function removeImageClozeRegion(
  currentImageRegions: StoredImageRegionGroup[] | null | undefined,
  attachmentId: string,
  regionId: string
): StoredImageRegionGroup[] | null {
  if (!currentImageRegions) {
    return currentImageRegions ?? null;
  }

  const nextGroups = currentImageRegions
    .map((group) => {
      if (group.attachmentId !== attachmentId) {
        return group;
      }
      return {
        ...group,
        regions: group.regions.filter((region) => region.id !== regionId)
      };
    })
    .filter((group) => group.regions.length > 0);

  return nextGroups.length > 0 ? nextGroups : null;
}

function isFiniteRatio(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isImageClozeLocator(value: unknown): value is ImageRegionLocator {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const width = candidate.width;
  const height = candidate.height;
  return (
    typeof candidate.attachmentId === 'string' &&
    candidate.attachmentId.trim().length > 0 &&
    isFiniteRatio(candidate.x) &&
    isFiniteRatio(candidate.y) &&
    typeof width === 'number' &&
    isFiniteRatio(width) &&
    typeof height === 'number' &&
    isFiniteRatio(height) &&
    width > 0 &&
    height > 0
  );
}

export function removeDeletedNodeImageRegions(
  current: StoredImageRegionGroup[] | null | undefined,
  deleted: { imageRegions?: StoredImageRegionGroup[] | null;
    anchorLink?: { id: string; kind: string; locator?: unknown } | null }
) {
  const grouped = deleted.imageRegions?.flatMap((group) =>
    group.regions.map((region) => ({ attachmentId: group.attachmentId, regionId: region.id }))
  );
  const anchor = deleted.anchorLink;
  const targets = grouped?.length ? grouped : anchor?.kind === 'cloze' && isImageClozeLocator(anchor.locator)
    ? [{ attachmentId: anchor.locator.attachmentId, regionId: anchor.id }] : [];
  let next = current;
  for (const target of targets) {
    if (next?.some((group) => group.attachmentId === target.attachmentId &&
        group.regions.some((region) => region.id === target.regionId))) {
      next = removeImageClozeRegion(next, target.attachmentId, target.regionId);
    }
  }
  return next;
}
