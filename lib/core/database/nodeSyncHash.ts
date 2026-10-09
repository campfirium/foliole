import { buildCanonicalNodeSyncPayload, type NodeSyncHashInput } from './nodeSyncPayload.js';
import { hashTextBody } from './textBodyHash.js';

export { buildCanonicalNodeSyncPayload } from './nodeSyncPayload.js';
export type { NodeSyncAttachmentRef, NodeSyncHashInput } from './nodeSyncPayload.js';

export function computeNodeSyncHash(input: NodeSyncHashInput): string {
  return hashTextBody(JSON.stringify(buildCanonicalNodeSyncPayload(input)));
}
