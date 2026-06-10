import { normalizeNodeViewStateWriteSource } from '../../lib/platform/persistedNodeViewState.js';

import { parseNodeSnapshotArgs } from './commandParserNodeSnapshot.js';
import { asNullableInteger, asString, asTimestamp } from './commandParserPrimitives.js';

export {
  asBoolean,
  asFiniteNumber,
  asIntegerInRange,
  asLiteralUnion,
  asNullableString,
  asString,
  asStringArray,
  asTimestamp
} from './commandParserPrimitives.js';
export {
  parseNodeCreationMutationArgs,
  parseNodeSnapshotArgs
} from './commandParserNodeSnapshot.js';
export { normalizeNodeViewStateWriteSource };

interface NodeViewStatePayload {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  updatedAt?: string | null;
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
    selectionTo: asNullableInteger(payload.selectionTo, `${field}.selectionTo`),
    updatedAt:
      payload.updatedAt === null || payload.updatedAt === undefined
        ? null
        : asTimestamp(payload.updatedAt, `${field}.updatedAt`)
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

export function parseNodeAnchorLocatorUpdateArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`invalid argument: ${field}[${index}]`);
    }
    const parsed = parseNodeSnapshotArgs({
      ...item,
      parentNodeId: null,
      kind: 'topic',
      title: '',
      isTitleManual: false,
      content: '',
      reveal: null,
      position: null,
      createdAt: '',
      imageRegions: (item as Record<string, unknown>).imageRegions ?? null,
      reading: null
    } as Record<string, unknown>);
    if (!parsed.anchorLink) {
      throw new Error(`invalid argument: ${field}[${index}].anchorLink`);
    }
    return {
      nodeId: parsed.nodeId,
      anchorLink: parsed.anchorLink,
      imageRegions: parsed.imageRegions,
      updatedAt: parsed.updatedAt
    };
  });
}
