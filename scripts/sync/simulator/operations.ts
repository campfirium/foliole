import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { flushNodeSyncVersionWithDriver } from '../../../electron/database/nodeSyncVersionFromDriver.js';
import { softDeleteNodesWithParents } from '../../../electron/database/nodeTrashTransitions.js';
import type { NodeAnchorLinkPayload } from '../../../lib/core/database/nodeMutationPayloads.js';
import { upsertNodeSnapshot } from '../../../lib/core/database/nodeMutations.js';
import { applyLocalContentEdit } from '../../../lib/core/sync/localContentEdit.js';
import { createOpaqueVersionRef } from '../../../lib/core/sync/opaqueSyncRefs.js';

import { inPeer, type SimulatorPeer } from './scope.js';

export interface Operation { action: string; peer: string; [key: string]: unknown; }
export const operations: Operation[] = [];
let sequence = 0;
export function resetOperations() { sequence = 0; operations.length = 0; }
function next(peer: SimulatorPeer, action: string, details: Record<string, unknown>) {
  const at = new Date(Date.UTC(2026, 8, 30, 0, 0, ++sequence)).toISOString();
  const version = createOpaqueVersionRef(`${process.env.FOLIOLE_SIM_SCENARIO}:${process.env.FOLIOLE_SIM_SEED ?? '1'}:${peer.name}:${sequence}`);
  operations.push({ action, peer: peer.name, at, version, ...details });
  return { at, version };
}
export function edit(peer: SimulatorPeer, content: string, nodeId = 'topic', options: {
  kind?: 'topic' | 'folder' | 'item'; title?: string; anchorLink?: NodeAnchorLinkPayload;
  parentNodeId?: string;
} = {}) {
  const { at, version } = next(peer, 'edit', { content, nodeId, ...options });
  return inPeer(peer, () => peer.driver.transaction((driver) => {
    upsertNodeSnapshot(driver, { nodeId, content, title: options.title ?? 'Topic',
      kind: options.kind ?? 'topic', parentNodeId: options.parentNodeId ?? null,
      anchorLink: options.anchorLink ?? null, createdAt: at, updatedAt: at,
      hostName: peer.name, isTitleManual: true, position: null, reveal: null });
    return flushNodeSyncVersionWithDriver(driver, nodeId, peer.name, at, version)!;
  }));
}
export async function mobileEdit(peer: SimulatorPeer, baseVersionId: string, content: string, nodeId = 'topic') {
  const { at, version } = next(peer, 'mobile-edit', { baseVersionId, content, nodeId });
  await inPeer(peer, () => applyLocalContentEdit(createBetterSqliteDbPort(peer.sqlite), {
    baseVersionId, content, hideTitleHeading: false, hostName: peer.name, nodeId,
    title: 'Topic', updatedAt: at, versionId: version }, undefined, { enqueueSearchInvalidations: false }));
  return version;
}
export function remove(peer: SimulatorPeer, nodeId = 'topic') {
  const { at, version } = next(peer, 'delete', { nodeId });
  return inPeer(peer, () => {
    softDeleteNodesWithParents({ nodeIds: [nodeId], deletedAt: at });
    return flushNodeSyncVersionWithDriver(peer.driver, nodeId, peer.name, at, version);
  });
}
