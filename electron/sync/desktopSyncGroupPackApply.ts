import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { markSyncGroupRestoreApplied } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { materializeDesktopSettingRecord } from '../database/desktopSettingMaterializer.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

import type { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupHttp.js';
import { readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';
import { extractSyncPackDatabase } from './syncPackContainerReader.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

type Peer = {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  peer_device_id: string;
  peer_device_name?: string;
};

type ApplyResult = Awaited<ReturnType<typeof applySyncPackNodeSurfaceWithDbPort>>;
export const DESKTOP_SYNC_GROUP_STRUCTURE_TIMEOUT_MS = 30_000;

export async function fetchDesktopSyncGroupPackBody(args: {
  headers: Record<string, string>;
  groupId: string;
  pathWithQuery: string;
  timeoutMs?: number;
  url: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    args.timeoutMs ?? DESKTOP_SYNC_GROUP_STRUCTURE_TIMEOUT_MS
  );
  try {
    const response = await fetch(args.url, { headers: args.headers, signal: controller.signal });
    return await readDesktopWorkgroupResponse({
      contentType: 'application/zip', groupId: args.groupId,
      method: 'GET', pathWithQuery: args.pathWithQuery, response
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('sync_group_structure_pack_timeout', { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectSyncPackAppliedEvent(port: DbPort, result: ApplyResult) {
  if (!result.applied) return {
    appliedNodeIds: result.appliedTombstoneNodeIds,
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
  const nodes = await port.query<{ id: string }>('SELECT id FROM inc.nodes');
  const objects = await port.query<{ object_id: string; object_type: string }>(
    'SELECT object_id, object_type FROM inc.sync_objects'
  );
  return {
    appliedNodeIds: [...new Set([...nodes.map((row) => row.id), ...result.appliedTombstoneNodeIds])],
    appliedObjectIds: [...new Set(objects.map((row) => `${row.object_type}:${row.object_id}`))],
    appliedReviewOpIds: result.appliedReviewOpIds
  };
}

export async function downloadAndApplyDesktopSyncGroupPack(args: {
  after: number;
  createHeaders: typeof createDesktopSyncGroupSignedHeaders;
  peer: Peer;
  restoreId?: string;
}) {
  const pathWithQuery = `/companion/sync-pack?after_state_seq=${args.after}` +
    (args.restoreId ? `&restore_id=${encodeURIComponent(args.restoreId)}` : '');
  const key = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(args.peer.group_id));
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  const body = await fetchDesktopSyncGroupPackBody({
    groupId: args.peer.group_id,
    headers: args.createHeaders({ groupId: args.peer.group_id,
      localDeviceId: args.peer.local_device_id,
      method: 'GET', pathWithQuery, secret: key.group_key }),
    pathWithQuery,
    url: `${args.peer.endpoint_url}${pathWithQuery}`
  });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-initial-sync-'));
  try {
    return await applyDesktopSyncGroupPack(args, body, tempRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export async function applyDesktopSyncGroupPack(
  args: Pick<Parameters<typeof downloadAndApplyDesktopSyncGroupPack>[0], 'after' | 'peer' | 'restoreId'>,
  body: Buffer,
  tempRoot: string
) {
  const incomingPath = path.join(tempRoot, 'incoming.db');
  const sourceDeviceName = args.peer.peer_device_name?.trim();
  if (!sourceDeviceName) throw new Error('sync_group_source_device_unavailable');
  const manifest = await extractSyncPackDatabase({
    body, expectedPeerId: args.peer.local_device_id,
    expectedSourcePeerId: args.peer.peer_device_id, outputPath: incomingPath
  });
  if (args.restoreId && (args.after !== 0 || manifest.restoreId !== args.restoreId)) {
    throw new Error('sync_group_restore_pack_mismatch');
  }
  if (manifest.toStateSeq < args.after) throw new Error('sync_pack_provider_frontier_rollback');
  const { cursor, event, participatingArticleIds } = await runWithDatabaseConnectionOwner(async () => {
    const hostName = loadOrCreateDesktopHostName();
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, {
      name: 'desktop-sync-group-pack-apply'
    });
    await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
    try {
      await assertSyncPackManifestMatchesDatabase(port, manifest);
      const apply = (database: DbPort) => applySyncPackNodeSurfaceWithDbPort(database, {
        currentCursor: args.after, hostName,
        incomingAlias: 'inc', sourceHostName: sourceDeviceName,
        sourcePeerId: args.peer.peer_device_id,
        recordVersionReceipt: true,
        onSettingApplied: materializeDesktopSettingRecord
      });
      const outcome = args.restoreId ? await port.transaction(async (tx) => {
        const removedNodeIds = await clearWorkgroupSyncDataForRestore(tx, args.restoreId!);
        const applied = await apply(tx);
        const event = await loadPendingRestoreEvent(tx, args.peer.group_id, args.restoreId!);
        await markSyncGroupRestoreApplied(tx, event);
        await tx.run(`INSERT INTO sync_peer_cursors (peer_id, stream_name, cursor_value, updated_at)
          VALUES (?, 'state', ?, ?) ON CONFLICT(peer_id, stream_name) DO UPDATE SET
          cursor_value = excluded.cursor_value, updated_at = excluded.updated_at`,
        [args.peer.peer_device_id, String(applied.toStateSeq), new Date().toISOString()]);
        return { result: applied, removedNodeIds };
      }) : { result: await apply(port), removedNodeIds: [] as string[] };
      if (args.restoreId) initializeWorkspaceSearchSidecar(openDatabaseConnection(), {
        requireCurrentSource: true
      });
      const result = outcome.result;
      const event = await collectSyncPackAppliedEvent(port, result);
      return {
        cursor: result.toStateSeq,
        event: { ...event, appliedNodeIds: [...new Set([
          ...event.appliedNodeIds, ...outcome.removedNodeIds
        ])] },
        participatingArticleIds: result.participatingArticleIds
      };
    } finally {
      await port.run('DETACH DATABASE inc');
    }
  });
  return { cursor, event, participatingArticleIds };
}

async function loadPendingRestoreEvent(port: DbPort, groupId: string, restoreId: string) {
  const [event] = await port.query<{
    group_id: string; restore_id: string; restored_at: string; source_device_identity_key: string
  }>(`SELECT group_id, restore_id, restored_at, source_device_identity_key
    FROM sync_group_restore_events WHERE group_id = ? AND restore_id = ? AND applied_at IS NULL`,
  [groupId, restoreId]);
  if (!event) throw new Error('sync_group_restore_superseded');
  return event;
}
