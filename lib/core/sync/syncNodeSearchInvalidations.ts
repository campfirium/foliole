import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { DELETE_NODE_SEARCH_PENDING_SQL, INSERT_NODE_SEARCH_PENDING_SQL } from '../database/searchPendingState.js';
import {
  WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY,
  WORKSPACE_SEARCH_QUEUED_REVISION_KEY,
  WORKSPACE_SEARCH_SOURCE_REVISION_KEY
} from '../database/workspaceSearchSourceState.js';

import type { DbPort } from './dbPort.js';

export interface LocalSyncNodeSearchInvalidationState {
  deleted_at: string | null;
  parent_id: string | null;
  title: string;
}

async function enqueueNodeSearchInvalidation(port: DbPort, nodeId: string, updatedAt: string) {
  await port.run(DELETE_NODE_SEARCH_PENDING_SQL, [nodeId]);
  await port.run(INSERT_NODE_SEARCH_PENDING_SQL, [nodeId, updatedAt, updatedAt]);
}

async function advanceWorkspaceSearchSourceRevision(port: DbPort, updatedAt: string) {
  await ensureWorkspaceSearchSourceState(port, updatedAt);
  const advanced = await port.run(
    `UPDATE settings
     SET value = CAST(value AS INTEGER) + 1, updated_at = ?
     WHERE key = ?`,
    [updatedAt, WORKSPACE_SEARCH_SOURCE_REVISION_KEY]
  );
  if (advanced.changes !== 1) throw new Error('workspace_search_source_state_missing');
}

async function ensureWorkspaceSearchSourceState(port: DbPort, updatedAt: string) {
  const initialValues = [
    [WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY, globalThis.crypto.randomUUID()],
    [WORKSPACE_SEARCH_QUEUED_REVISION_KEY, '0'],
    [WORKSPACE_SEARCH_SOURCE_REVISION_KEY, '0']
  ] as const;
  for (const [key, value] of initialValues) {
    await port.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO NOTHING`,
      [key, value, updatedAt]
    );
  }
}

async function markWorkspaceSearchSourceRevisionQueued(port: DbPort, updatedAt: string) {
  const queued = await port.run(
    `UPDATE settings
     SET value = (SELECT value FROM settings WHERE key = ?), updated_at = ?
     WHERE key = ?`,
    [WORKSPACE_SEARCH_SOURCE_REVISION_KEY, updatedAt, WORKSPACE_SEARCH_QUEUED_REVISION_KEY]
  );
  if (queued.changes !== 1) throw new Error('workspace_search_source_state_missing');
}

export async function enqueueAppliedNodeDeleteSearchInvalidation(
  port: DbPort,
  nodeId: string,
  updatedAt: string
) {
  await advanceWorkspaceSearchSourceRevision(port, updatedAt);
  await enqueueNodeSearchInvalidation(port, nodeId, updatedAt);
  await markWorkspaceSearchSourceRevisionQueued(port, updatedAt);
}

export async function enqueueAppliedNodeBodySearchInvalidation(port: DbPort, nodeId: string, updatedAt: string) {
  await advanceWorkspaceSearchSourceRevision(port, updatedAt);
  await enqueueNodeSearchInvalidation(port, nodeId, updatedAt);
  await markWorkspaceSearchSourceRevisionQueued(port, updatedAt);
}

export async function enqueueAppliedNodeSearchInvalidations(
  port: DbPort,
  _localNode: LocalSyncNodeSearchInvalidationState | null,
  record: NativeSyncNodeRecord,
  updatedAt: string
) {
  await advanceWorkspaceSearchSourceRevision(port, updatedAt);
  await enqueueNodeSearchInvalidation(port, record.object_id, updatedAt);
  await markWorkspaceSearchSourceRevisionQueued(port, updatedAt);
}
