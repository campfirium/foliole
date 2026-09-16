import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const PREFIX = 'node-readwise-unlocated-';

export function buildReadwiseUnlocatedNodeId(connectionRef: string, documentId: string) {
  const hash = bytesToHex(sha256(new TextEncoder().encode(`${connectionRef}\u001f${documentId}`)));
  return `${PREFIX}${hash.slice(0, 24)}`;
}

export function isReadwiseUnlocatedNodeId(nodeId: string) {
  return nodeId.startsWith(PREFIX);
}
