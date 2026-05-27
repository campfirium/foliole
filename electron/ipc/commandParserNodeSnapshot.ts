import { isReadingState, type ReadingState } from '../../lib/core/review/readingState.js';

import { asAnchorLink } from './commandParserAnchorLink.js';
import { asImageRegions } from './commandParserImageRegions.js';
import {
  asBoolean,
  asIntegerInRange,
  asNodeKind,
  asNullableFiniteNumber,
  asNullableInteger,
  asNullableString,
  asString,
  asStringArray,
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
  state: ReadingState;
}

interface ReviewProfilePayload {
  due: string;
  lastReviewAt: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

function asReadingState(value: unknown, field: string): ReadingProfilePayload['state'] {
  if (isReadingState(value)) {
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

function asReviewProfile(value: unknown, field: string): ReviewProfilePayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as Record<string, unknown>;
  return {
    due: asTimestamp(payload.due, `${field}.due`),
    lastReviewAt: asNullableString(payload.lastReviewAt, `${field}.lastReviewAt`),
    state: asIntegerInRange(payload.state, `${field}.state`, 0, 3) as ReviewProfilePayload['state'],
    stability: asNullableFiniteNumber(payload.stability, `${field}.stability`) ?? 0,
    difficulty: asNullableFiniteNumber(payload.difficulty, `${field}.difficulty`) ?? 0,
    elapsedDays: asNullableInteger(payload.elapsedDays, `${field}.elapsedDays`) ?? 0,
    scheduledDays: asNullableInteger(payload.scheduledDays, `${field}.scheduledDays`) ?? 0,
    reps: asNullableInteger(payload.reps, `${field}.reps`) ?? 0,
    lapses: asNullableInteger(payload.lapses, `${field}.lapses`) ?? 0
  };
}

export function parseNodeSnapshotArgs(args: Record<string, unknown>) {
  return {
    nodeId: asString(args.nodeId, 'nodeId'),
    parentNodeId: asNullableString(args.parentNodeId, 'parentNodeId'),
    kind: asNodeKind(args.kind, 'kind'),
    priority: asNullableInteger(args.priority, 'priority'),
    desiredRetention: asNullableFiniteNumber(args.desiredRetention, 'desiredRetention'),
    enableShortTerm: args.enableShortTerm === undefined || args.enableShortTerm === null
      ? null
      : asBoolean(args.enableShortTerm, 'enableShortTerm'),
    sequentialReadingEnabled: args.sequentialReadingEnabled === undefined || args.sequentialReadingEnabled === null
      ? null
      : asBoolean(args.sequentialReadingEnabled, 'sequentialReadingEnabled'),
    shelvedAt: asNullableString(args.shelvedAt, 'shelvedAt'),
    manualChildOrder: args.manualChildOrder === undefined || args.manualChildOrder === null
      ? null
      : asStringArray(args.manualChildOrder, 'manualChildOrder'),
    title: asString(args.title, 'title'),
    isTitleManual: asBoolean(args.isTitleManual, 'isTitleManual'),
    hideTitleHeading: args.hideTitleHeading === undefined ? false : asBoolean(args.hideTitleHeading, 'hideTitleHeading'),
    content: asString(args.content, 'content'),
    virtualFilter: asVirtualNodeFilterValue(args.virtualFilter, 'virtualFilter'),
    reveal: asNullableString(args.reveal, 'reveal'),
    anchorLink: asAnchorLink(args.anchorLink, 'anchorLink'),
    imageRegions: asImageRegions(args.imageRegions, 'imageRegions'),
    reading: asReadingProfile(args.reading, 'reading'),
    review: asReviewProfile(args.review, 'review'),
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

export function parseNodeCreationMutationArgs(
  args: Record<string, unknown>,
  expectedKind: 'folder' | 'topic' | 'item'
) {
  return {
    activeNodeId:
      args.activeNodeId === null || args.activeNodeId === undefined
        ? null
        : asString(args.activeNodeId, 'activeNodeId'),
    node: parseNodeCreationArgs(args, expectedKind),
    nodeOrder: asStringArray(args.nodeOrder, 'nodeOrder')
  };
}
