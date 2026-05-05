import { randomUUID } from 'node:crypto';

import { appendSyncChangeLog, computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';

import type { DatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

const VIEW_STATE_SCOPE = 'session_resume';
const PLATFORM = 'windows';
const FORM_FACTOR = 'desktop';

export interface ActiveNodeViewStateInput {
  activeNodeId: string | null;
  updatedAt: string;
}

export interface NodeViewStateSyncInput {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  updatedAt: string;
}

function toViewStateObjectId(deviceId: string, key: string) {
  return `${VIEW_STATE_SCOPE}:${PLATFORM}:${FORM_FACTOR}:${deviceId}:${key}`;
}

function writeViewStateObject(connection: DatabaseConnection, key: string, payload: Record<string, unknown>, updatedAt: string) {
  const deviceId = loadOrCreateDesktopDeviceId(updatedAt);
  const objectId = toViewStateObjectId(deviceId, key);
  const syncPayload = {
    deviceId,
    formFactor: FORM_FACTOR,
    key,
    platform: PLATFORM,
    scope: VIEW_STATE_SCOPE,
    ...payload
  };
  const contentHash = computeSyncContentHash('view_state', syncPayload);
  upsertSyncObjectState(connection.driver, {
    objectType: 'view_state',
    objectId,
    contentHash,
    lastModifiedByDeviceId: deviceId,
    updatedAt,
    syncDirty: true
  });
  appendSyncChangeLog(connection.driver, {
    changeId: randomUUID(),
    objectType: 'view_state',
    objectId,
    changeType: 'upsert',
    deviceId,
    contentHash,
    payloadJson: JSON.stringify(syncPayload),
    createdAt: updatedAt,
    appliedAt: updatedAt
  });
}

export function writeActiveNodeViewStateSync(
  connection: DatabaseConnection,
  input: ActiveNodeViewStateInput
) {
  writeViewStateObject(
    connection,
    'active_node',
    { activeNodeId: input.activeNodeId },
    input.updatedAt
  );
}

export function writeNodeViewStateSync(connection: DatabaseConnection, input: NodeViewStateSyncInput) {
  writeViewStateObject(
    connection,
    `node:${input.nodeId}`,
    {
      nodeId: input.nodeId,
      scrollTop: input.scrollTop,
      selectionFrom: input.selectionFrom,
      selectionTo: input.selectionTo
    },
    input.updatedAt
  );
}
