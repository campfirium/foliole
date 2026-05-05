export {
  asBoolean,
  asNullableString,
  asString,
  asStringArray,
  asTimestamp
} from './commandParserPrimitives.js';
export { parseNodeCreationArgs, parseNodeSnapshotArgs } from './commandParserNodeSnapshot.js';

import { asNullableInteger, asString } from './commandParserPrimitives.js';

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
