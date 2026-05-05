import { parseAnchorLinkLocatorRects } from './anchorLinkLocatorRects.js';
import {
  asBoolean,
  asNodeKind,
  asNullableFiniteNumber,
  asNullableInteger,
  asNullableString,
  asRatio,
  asString,
  asTimestamp,
  asVirtualNodeFilterValue
} from './commandParserPrimitives.js';

interface AnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    attachmentId?: string;
    height?: number;
    page?: number;
    rects?: Array<{
      height: number;
      width: number;
      x: number;
      y: number;
    }>;
    width?: number;
    x: number;
    y: number;
  };
}

interface ReadingProfilePayload {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

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

interface RawAnchorLocator {
  attachmentId?: unknown;
  height?: unknown;
  page?: unknown;
  rects?: unknown;
  width?: unknown;
  x: number;
  y: number;
}

function parseImageAnchorLocator(locator: RawAnchorLocator, field: string) {
  if (typeof locator.width !== 'number' || !Number.isFinite(locator.width) || locator.width <= 0) {
    throw new Error(`invalid argument: ${field}.locator.width`);
  }
  if (typeof locator.height !== 'number' || !Number.isFinite(locator.height) || locator.height <= 0) {
    throw new Error(`invalid argument: ${field}.locator.height`);
  }
  return {
    attachmentId: locator.attachmentId as string,
    height: Math.max(0, Math.min(1, locator.height)),
    width: Math.max(0, Math.min(1, locator.width)),
    x: Math.max(0, Math.min(1, locator.x)),
    y: Math.max(0, Math.min(1, locator.y))
  };
}

function parsePdfAnchorLocator(locator: RawAnchorLocator, field: string) {
  if (typeof locator.page !== 'number' || !Number.isInteger(locator.page) || locator.page < 1) {
    throw new Error(`invalid argument: ${field}.locator.page`);
  }
  return {
    page: locator.page,
    rects: parseAnchorLinkLocatorRects(locator.rects, `${field}.locator.rects`),
    x: Math.max(0, Math.min(1, locator.x)),
    y: Math.max(0, Math.min(1, locator.y))
  };
}

function asAnchorLink(value: unknown, field: string): AnchorLinkPayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as {
    id?: unknown;
    kind?: unknown;
    locator?: RawAnchorLocator;
  };
  if (typeof payload.id !== 'string') {
    throw new Error(`invalid argument: ${field}.id`);
  }
  if (payload.kind !== 'highlight' && payload.kind !== 'cloze') {
    throw new Error(`invalid argument: ${field}.kind`);
  }
  const anchorLink: AnchorLinkPayload = { id: payload.id, kind: payload.kind };
  if (payload.locator === undefined) {
    return anchorLink;
  }
  const locator = payload.locator;
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    throw new Error(`invalid argument: ${field}.locator`);
  }
  if (typeof locator.x !== 'number' || !Number.isFinite(locator.x)) {
    throw new Error(`invalid argument: ${field}.locator.x`);
  }
  if (typeof locator.y !== 'number' || !Number.isFinite(locator.y)) {
    throw new Error(`invalid argument: ${field}.locator.y`);
  }
  anchorLink.locator =
    typeof locator.attachmentId === 'string' && locator.attachmentId.trim().length > 0
      ? parseImageAnchorLocator(locator, field)
      : parsePdfAnchorLocator(locator, field);
  return anchorLink;
}

function asReadingState(value: unknown, field: string): ReadingProfilePayload['state'] {
  if (value === 'active' || value === 'done' || value === 'dismissed') {
    return value;
  }
  throw new Error(`invalid argument: ${field}`);
}

function asReadingProfile(value: unknown, field: string): ReadingProfilePayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as Record<string, unknown>;
  return {
    intervalDurationMs: asNullableInteger(payload.intervalDurationMs, `${field}.intervalDurationMs`) ?? 0,
    intervalGrowthFactor: asNullableFiniteNumber(payload.intervalGrowthFactor, `${field}.intervalGrowthFactor`) ?? 0,
    lastHandledAt: asTimestamp(payload.lastHandledAt, `${field}.lastHandledAt`),
    nextAt: asTimestamp(payload.nextAt, `${field}.nextAt`),
    priority: asNullableFiniteNumber(payload.priority, `${field}.priority`) ?? 0,
    readingPosition: asNullableInteger(payload.readingPosition, `${field}.readingPosition`) ?? 0,
    repetitionCount: asNullableInteger(payload.repetitionCount, `${field}.repetitionCount`) ?? 0,
    state: asReadingState(payload.state, `${field}.state`)
  };
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

function asImageRegions(value: unknown, field: string): ImageRegionGroupPayload[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value.map((entry, index) => asImageRegionGroup(entry, `${field}[${index}]`));
}

export function parseNodeSnapshotArgs(args: Record<string, unknown>) {
  return {
    nodeId: asString(args.nodeId, 'nodeId'),
    parentNodeId: asNullableString(args.parentNodeId, 'parentNodeId'),
    kind: asNodeKind(args.kind, 'kind'),
    priority: asNullableInteger(args.priority, 'priority'),
    desiredRetention: asNullableFiniteNumber(args.desiredRetention, 'desiredRetention'),
    title: asString(args.title, 'title'),
    isTitleManual: asBoolean(args.isTitleManual, 'isTitleManual'),
    hideTitleHeading: args.hideTitleHeading === undefined ? false : asBoolean(args.hideTitleHeading, 'hideTitleHeading'),
    content: asString(args.content, 'content'),
    virtualFilter: asVirtualNodeFilterValue(args.virtualFilter, 'virtualFilter'),
    reveal: asNullableString(args.reveal, 'reveal'),
    anchorLink: asAnchorLink(args.anchorLink, 'anchorLink'),
    imageRegions: asImageRegions(args.imageRegions, 'imageRegions'),
    reading: asReadingProfile(args.reading, 'reading'),
    position: asNullableInteger(args.position, 'position'),
    createdAt: asString(args.createdAt, 'createdAt'),
    updatedAt: asString(args.updatedAt, 'updatedAt')
  };
}

export function parseNodeCreationArgs(
  args: Record<string, unknown>,
  expectedKind: 'folder' | 'topic' | 'item'
) {
  const parsed = parseNodeSnapshotArgs(args);
  if (parsed.kind !== expectedKind) {
    throw new Error('invalid argument: kind');
  }
  return parsed;
}
