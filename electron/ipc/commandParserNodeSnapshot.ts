import { asAnchorLink } from './commandParserAnchorLink.js';
import { asImageRegions } from './commandParserImageRegions.js';
import {
  asBoolean,
  asNodeKind,
  asNullableFiniteNumber,
  asNullableInteger,
  asNullableString,
  asString,
  asTimestamp,
  asVirtualNodeFilterValue
} from './commandParserPrimitives.js';

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
