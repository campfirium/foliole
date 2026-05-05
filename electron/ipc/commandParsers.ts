import { isNodeKind } from '../../lib/core/nodes/nodeKind.js';

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asString(value, field);
}

export function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asNullableInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asNullableFiniteNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

export function asTimestamp(value: unknown, field: string): string {
  const timestamp = asString(value, field);
  if (!timestamp.trim()) {
    throw new Error(`invalid argument: ${field}`);
  }
  return timestamp;
}

interface AnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
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

function asAnchorLink(value: unknown, field: string): AnchorLinkPayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as { id?: unknown; kind?: unknown };
  if (typeof payload.id !== 'string') {
    throw new Error(`invalid argument: ${field}.id`);
  }
  if (payload.kind !== 'highlight' && payload.kind !== 'cloze') {
    throw new Error(`invalid argument: ${field}.kind`);
  }
  return { id: payload.id, kind: payload.kind };
}

function asReadingState(value: unknown, field: string): ReadingProfilePayload['state'] {
  if (value === 'active' || value === 'done' || value === 'dismissed') {
    return value;
  }
  throw new Error(`invalid argument: ${field}`);
}

function asNodeKind(value: unknown, field: string) {
  if (!isNodeKind(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
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
    intervalGrowthFactor:
      asNullableFiniteNumber(payload.intervalGrowthFactor, `${field}.intervalGrowthFactor`) ?? 0,
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
    reveal: asNullableString(args.reveal, 'reveal'),
    anchorLink: asAnchorLink(args.anchorLink, 'anchorLink'),
    reading: asReadingProfile(args.reading, 'reading'),
    position: asNullableInteger(args.position, 'position'),
    createdAt: asString(args.createdAt, 'createdAt'),
    updatedAt: asString(args.updatedAt, 'updatedAt')
  };
}

interface NodeViewStatePayload {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
}

function parseNodeViewStatePayload(value: unknown, field: string): NodeViewStatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as Record<string, unknown>;
  return {
    nodeId: asString(payload.nodeId, `${field}.nodeId`),
    scrollTop: asNullableInteger(payload.scrollTop, `${field}.scrollTop`) ?? 0,
    selectionFrom: asNullableInteger(payload.selectionFrom, `${field}.selectionFrom`),
    selectionTo: asNullableInteger(payload.selectionTo, `${field}.selectionTo`)
  };
}

export function parseNodeViewStatePayloadArray(
  value: unknown,
  field: string
): NodeViewStatePayload[] {
  if (!Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value.map((item, index) => parseNodeViewStatePayload(item, `${field}[${index}]`));
}
