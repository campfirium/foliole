import { createHash } from 'node:crypto';

const PREFIX = 'node-readwise-unlocated-';

export function buildReadwiseUnlocatedNodeId(connectionRef: string, documentId: string) {
  const hash = createHash('sha256').update(`${connectionRef}\u001f${documentId}`).digest('hex');
  return `${PREFIX}${hash.slice(0, 24)}`;
}

export function isReadwiseUnlocatedNodeId(nodeId: string) {
  return nodeId.startsWith(PREFIX);
}
