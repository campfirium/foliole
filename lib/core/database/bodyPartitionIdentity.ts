import { hashTextBody } from './textBodyHash.js';

export const BODY_PART_ID_PREFIX = 'node-body-part-';
const BODY_PART_HASH_WIDTH = 24;
export const BODY_PART_NUMBER_WIDTH = 12;
export const BODY_PART_SLOT_ID_LENGTH = BODY_PART_ID_PREFIX.length + BODY_PART_HASH_WIDTH + 1 + BODY_PART_NUMBER_WIDTH;

export function bodyPartPrefix(nodeId: string) {
  return `${BODY_PART_ID_PREFIX}${hashTextBody(nodeId).slice(0, BODY_PART_HASH_WIDTH)}-`;
}

export function bodyPartNodeId(nodeId: string, index: number) {
  return `${bodyPartPrefix(nodeId)}${String(index).padStart(BODY_PART_NUMBER_WIDTH, '0')}`;
}
