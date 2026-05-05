import {
  asRatio,
  asString
} from './commandParserPrimitives.js';

interface ImageRegionPayload {
  id: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

interface ImageRegionGroupPayload {
  attachmentId: string;
  regions: ImageRegionPayload[];
}

function asImageRegion(value: unknown, field: string): ImageRegionPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as Record<string, unknown>;
  return {
    id: asString(payload.id, `${field}.id`),
    height: asRatio(payload.height, `${field}.height`),
    width: asRatio(payload.width, `${field}.width`),
    x: asRatio(payload.x, `${field}.x`),
    y: asRatio(payload.y, `${field}.y`)
  };
}

function asImageRegionGroup(value: unknown, field: string): ImageRegionGroupPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.regions)) {
    throw new Error(`invalid argument: ${field}.regions`);
  }
  return {
    attachmentId: asString(payload.attachmentId, `${field}.attachmentId`),
    regions: payload.regions.map((region, index) => asImageRegion(region, `${field}.regions[${index}]`))
  };
}

export function asImageRegions(value: unknown, field: string): ImageRegionGroupPayload[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value.map((entry, index) => asImageRegionGroup(entry, `${field}[${index}]`));
}
