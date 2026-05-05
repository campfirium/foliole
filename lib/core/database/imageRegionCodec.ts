export interface StoredImageRegion {
  id: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface StoredImageRegionGroup {
  attachmentId: string;
  regions: StoredImageRegion[];
}

function isFiniteRatio(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isStoredImageRegion(value: unknown): value is StoredImageRegion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const width = candidate.width;
  const height = candidate.height;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    isFiniteRatio(candidate.x) &&
    isFiniteRatio(candidate.y) &&
    typeof width === 'number' &&
    typeof height === 'number' &&
    isFiniteRatio(width) &&
    isFiniteRatio(height) &&
    width > 0 &&
    height > 0
  );
}

function isStoredImageRegionGroup(value: unknown): value is StoredImageRegionGroup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.attachmentId === 'string' &&
    candidate.attachmentId.trim().length > 0 &&
    Array.isArray(candidate.regions) &&
    candidate.regions.every(isStoredImageRegion)
  );
}

export function parseStoredImageRegions(value: string | null | undefined): StoredImageRegionGroup[] | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    const groups = parsed.filter(isStoredImageRegionGroup);
    return groups.length > 0 ? groups : null;
  } catch {
    return null;
  }
}
