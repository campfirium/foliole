import { hashTextBody } from './textBodyHash.js';

export function bodyPartPrefix(nodeId: string) {
  return `node-body-part-${hashTextBody(nodeId).slice(0, 24)}-`;
}

export function bodyPartNodeId(nodeId: string, index: number) {
  return `${bodyPartPrefix(nodeId)}${String(index).padStart(12, '0')}`;
}
