import { createHash } from 'node:crypto';

import { buildCanonicalNodeSyncPayload, type NodeSyncHashInput } from './nodeSyncPayload.js';

export { buildCanonicalNodeSyncPayload } from './nodeSyncPayload.js';
export type { NodeSyncAttachmentRef, NodeSyncHashInput } from './nodeSyncPayload.js';

export function computeNodeSyncHash(input: NodeSyncHashInput) {
  return createHash('sha256').update(JSON.stringify(buildCanonicalNodeSyncPayload(input))).digest('hex');
}
