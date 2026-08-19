import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import {
  type NodeViewStateWriteSource,
  withoutNodeViewStateHashSource
} from '../../lib/platform/persistedNodeViewState.js';

import type { DatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

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
  source: NodeViewStateWriteSource;
  updatedAt: string;
}

function toViewStateObjectId(hostName: string, key: string) {
  return `${VIEW_STATE_SCOPE}:${PLATFORM}:${FORM_FACTOR}:${hostName}:${key}`;
}

function writeViewStateObject(connection: DatabaseConnection, key: string, payload: Record<string, unknown>, updatedAt: string) {
  const hostName = loadOrCreateDesktopHostName(updatedAt);
  const objectId = toViewStateObjectId(hostName, key);
  const syncPayload = {
    host_name: hostName,
    form_factor: FORM_FACTOR,
    key,
    platform: PLATFORM,
    scope: VIEW_STATE_SCOPE,
    ...payload
  };
  const contentHash = computeSyncContentHash('view_state', withoutNodeViewStateHashSource(syncPayload));
  upsertSyncObjectState(connection.driver, {
    objectType: 'view_state',
    objectId,
    contentHash,
    lastModifiedByHostName: hostName,
    updatedAt,
    syncDirty: true
  });
}

export function writeActiveNodeViewStateSync(
  connection: DatabaseConnection,
  input: ActiveNodeViewStateInput
) {
  writeViewStateObject(
    connection,
    'active_node',
    { active_node_id: input.activeNodeId },
    input.updatedAt
  );
}

export function writeNodeViewStateSync(connection: DatabaseConnection, input: NodeViewStateSyncInput) {
  writeViewStateObject(
    connection,
    `node:${input.nodeId}`,
    {
      node_id: input.nodeId,
      scroll_top: input.scrollTop,
      selection_from: input.selectionFrom,
      selection_to: input.selectionTo,
      source: input.source
    },
    input.updatedAt
  );
}
